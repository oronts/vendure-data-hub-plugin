import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';
import {
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    ID,
} from '@vendure/core';
import {
    ConsumerControlOverrides,
    DataHubSettings,
    StoredAutoMapperConfig,
} from '../../entities/config';
import { LogPersistenceLevel } from '../../constants/enums';
import {
    AutoMapperConfig,
    AutoMapperConfigInput,
    DEFAULT_AUTO_MAPPER_CONFIG,
    validateAutoMapperConfig,
    AutoMapperConfigValidation,
} from '../../mappers';

const SETTINGS_SCOPE = 'global';

const PROCESS_LOCAL_SETTINGS_DATABASE_TYPES = new Set([
    'better-sqlite3',
    'sqlite',
    'sqljs',
]);

const PESSIMISTIC_LOCK_DATABASE_TYPES = new Set([
    'aurora-mysql',
    'aurora-postgres',
    'cockroachdb',
    'mariadb',
    'mssql',
    'mysql',
    'oracle',
    'postgres',
    'sap',
]);

function requiresPessimisticSettingsLock(databaseType: string): boolean {
    const normalized = databaseType.trim().toLowerCase();
    if (PROCESS_LOCAL_SETTINGS_DATABASE_TYPES.has(normalized)) {
        return false;
    }
    if (PESSIMISTIC_LOCK_DATABASE_TYPES.has(normalized)) {
        return true;
    }
    throw new Error(
        `Data Hub settings mutations do not support database type "${databaseType}"`,
    );
}

function normalizeConsumerControlOverrides(value: unknown): ConsumerControlOverrides {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const overrides: ConsumerControlOverrides = {};
    for (const [key, enabled] of Object.entries(value)) {
        if (key.length > 0 && typeof enabled === 'boolean') {
            overrides[key] = enabled;
        }
    }
    return overrides;
}

function validateConsumerControlOverrides(
    value: Readonly<Record<string, boolean>>,
): ConsumerControlOverrides {
    for (const [key, enabled] of Object.entries(value)) {
        if (key.length === 0 || typeof enabled !== 'boolean') {
            throw new Error('Consumer control overrides require non-empty keys and boolean values');
        }
    }
    return { ...value };
}

/** Full settings response including logging configuration */
export interface DataHubSettingsResult {
    retentionDaysRuns: number | null;
    retentionDaysErrors: number | null;
    retentionDaysLogs: number | null;
    logPersistenceLevel: LogPersistenceLevel;
}

/** Input for updating settings */
export interface DataHubSettingsInput {
    retentionDaysRuns?: number | null;
    retentionDaysErrors?: number | null;
    retentionDaysLogs?: number | null;
    logPersistenceLevel?: LogPersistenceLevel;
}

@Injectable()
export class DataHubSettingsService {
    private settingsMutationTail: Promise<void> = Promise.resolve();

    constructor(private connection: TransactionalConnection, private ctxService: RequestContextService) {}

    private async getCtx(ctx?: RequestContext): Promise<RequestContext> {
        return ctx ?? this.ctxService.create({ apiType: 'admin' });
    }

    private async getSettingsRow(
        requestCtx?: RequestContext,
        lockForUpdate = false,
    ): Promise<DataHubSettings> {
        const ctx = await this.getCtx(requestCtx);
        const repo = this.connection.getRepository(ctx, DataHubSettings);
        const findRow = () => lockForUpdate
            ? repo.findOne({ where: { scope: SETTINGS_SCOPE }, lock: { mode: 'pessimistic_write' } })
            : repo.findOne({ where: { scope: SETTINGS_SCOPE } });
        const row = await findRow();
        if (row) {
            return row;
        }

        await repo.createQueryBuilder()
            .insert()
            .into(DataHubSettings)
            .values({
                scope: SETTINGS_SCOPE,
                retentionDaysRuns: null,
                retentionDaysErrors: null,
                retentionDaysLogs: null,
                logPersistenceLevel: LogPersistenceLevel.PIPELINE,
                autoMapperConfig: null,
                pipelineAutoMapperConfigs: null,
                consumerControlOverrides: null,
            })
            .orIgnore()
            .execute();
        const created = await findRow();
        if (!created) {
            throw new Error('Failed to initialize Data Hub settings');
        }
        return created;
    }
    private async serializeSettingsMutation<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.settingsMutationTail
            .catch(() => undefined)
            .then(operation);
        this.settingsMutationTail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    private async withLockedSettingsRow<T>(
        requestCtx: RequestContext | undefined,
        work: (
            row: DataHubSettings,
            repository: Repository<DataHubSettings>,
            ctx: RequestContext,
        ) => Promise<T>,
    ): Promise<T> {
        return this.serializeSettingsMutation(async () => {
            const ctx = await this.getCtx(requestCtx);
            const databaseType = String(this.connection.rawConnection.options.type);
            const lockForUpdate = requiresPessimisticSettingsLock(databaseType);
            return this.connection.withTransaction(ctx, async transactionCtx => {
                const repository = this.connection.getRepository(transactionCtx, DataHubSettings);
                const row = await this.getSettingsRow(transactionCtx, lockForUpdate);
                return work(row, repository, transactionCtx);
            });
        });
    }

    async get(ctx?: RequestContext): Promise<DataHubSettingsResult> {
        const row = await this.getSettingsRow(ctx);
        return {
            retentionDaysRuns: row?.retentionDaysRuns ?? null,
            retentionDaysErrors: row?.retentionDaysErrors ?? null,
            retentionDaysLogs: row?.retentionDaysLogs ?? null,
            logPersistenceLevel: row?.logPersistenceLevel ?? LogPersistenceLevel.PIPELINE,
        };
    }

    async set(
        input: DataHubSettingsInput,
        requestCtx?: RequestContext,
    ): Promise<DataHubSettingsResult> {
        return this.withLockedSettingsRow(requestCtx, async (row, repository) => {
            if (input.retentionDaysRuns !== undefined) {
                row.retentionDaysRuns = input.retentionDaysRuns;
            }
            if (input.retentionDaysErrors !== undefined) {
                row.retentionDaysErrors = input.retentionDaysErrors;
            }
            if (input.retentionDaysLogs !== undefined) {
                row.retentionDaysLogs = input.retentionDaysLogs;
            }
            if (input.logPersistenceLevel !== undefined) {
                row.logPersistenceLevel = input.logPersistenceLevel;
            }
            const saved = await repository.save(row);
            return {
                retentionDaysRuns: saved.retentionDaysRuns ?? null,
                retentionDaysErrors: saved.retentionDaysErrors ?? null,
                retentionDaysLogs: saved.retentionDaysLogs ?? null,
                logPersistenceLevel: saved.logPersistenceLevel ?? LogPersistenceLevel.PIPELINE,
            };
        });
    }

    async getLogPersistenceLevel(): Promise<LogPersistenceLevel> {
        const row = await this.getSettingsRow();
        return row?.logPersistenceLevel ?? LogPersistenceLevel.PIPELINE;
    }

    async getConsumerControlOverrides(
        requestCtx?: RequestContext,
    ): Promise<ConsumerControlOverrides> {
        const row = await this.getSettingsRow(requestCtx);
        return normalizeConsumerControlOverrides(row.consumerControlOverrides);
    }

    async updateConsumerControlOverrides(
        updates: Readonly<Record<string, boolean>>,
        requestCtx?: RequestContext,
    ): Promise<ConsumerControlOverrides> {
        const validatedUpdates = validateConsumerControlOverrides(updates);
        return this.withLockedSettingsRow(requestCtx, async (row, repository) => {
            row.consumerControlOverrides = {
                ...normalizeConsumerControlOverrides(row.consumerControlOverrides),
                ...validatedUpdates,
            };

            const saved = await repository.save(row);
            return normalizeConsumerControlOverrides(saved.consumerControlOverrides);
        });
    }

    async getAutoMapperConfig(
        pipelineId?: ID | null,
        ctx?: RequestContext,
    ): Promise<AutoMapperConfig> {
        const row = await this.getSettingsRow(ctx);

        // Start with defaults
        let config: AutoMapperConfig = { ...DEFAULT_AUTO_MAPPER_CONFIG };

        // Apply global config if exists
        if (row.autoMapperConfig) {
            config = this.mergeStoredConfig(config, row.autoMapperConfig);
        }

        // Apply pipeline-specific config if exists
        if (pipelineId && row.pipelineAutoMapperConfigs) {
            const pipelineConfig = row.pipelineAutoMapperConfigs[String(pipelineId)];
            if (pipelineConfig) {
                config = this.mergeStoredConfig(config, pipelineConfig);
            }
        }

        return config;
    }

    getDefaultAutoMapperConfig(): AutoMapperConfig {
        return { ...DEFAULT_AUTO_MAPPER_CONFIG };
    }

    async updateAutoMapperConfig(
        input: AutoMapperConfigInput & { pipelineId?: ID | null },
        requestCtx?: RequestContext,
    ): Promise<AutoMapperConfig> {
        const storedConfig = this.inputToStoredConfig(input);
        return this.withLockedSettingsRow(requestCtx, async (row, repository, ctx) => {
            if (input.pipelineId) {
                if (!row.pipelineAutoMapperConfigs) {
                    row.pipelineAutoMapperConfigs = {};
                }
                const pipelineId = String(input.pipelineId);
                row.pipelineAutoMapperConfigs[pipelineId] = {
                    ...row.pipelineAutoMapperConfigs[pipelineId],
                    ...storedConfig,
                };
            } else {
                row.autoMapperConfig = {
                    ...row.autoMapperConfig,
                    ...storedConfig,
                };
            }

            await repository.save(row);
            return this.getAutoMapperConfig(input.pipelineId, ctx);
        });
    }

    async resetAutoMapperConfig(
        pipelineId?: ID | null,
        requestCtx?: RequestContext,
    ): Promise<AutoMapperConfig> {
        return this.withLockedSettingsRow(requestCtx, async (row, repository, ctx) => {
            if (pipelineId) {
                if (row.pipelineAutoMapperConfigs) {
                    delete row.pipelineAutoMapperConfigs[String(pipelineId)];
                }
            } else {
                row.autoMapperConfig = null;
            }

            await repository.save(row);
            return this.getAutoMapperConfig(pipelineId, ctx);
        });
    }

    validateAutoMapperConfig(input: AutoMapperConfigInput): AutoMapperConfigValidation {
        return validateAutoMapperConfig(input);
    }

    private mergeStoredConfig(base: AutoMapperConfig, stored: StoredAutoMapperConfig): AutoMapperConfig {
        return {
            confidenceThreshold: stored.confidenceThreshold ?? base.confidenceThreshold,
            enableFuzzyMatching: stored.enableFuzzyMatching ?? base.enableFuzzyMatching,
            enableTypeInference: stored.enableTypeInference ?? base.enableTypeInference,
            caseSensitive: stored.caseSensitive ?? base.caseSensitive,
            customAliases: {
                ...base.customAliases,
                ...stored.customAliases,
            },
            excludeFields: stored.excludeFields ?? base.excludeFields,
            weights: {
                nameSimilarity: stored.weights?.nameSimilarity ?? base.weights.nameSimilarity,
                typeCompatibility: stored.weights?.typeCompatibility ?? base.weights.typeCompatibility,
                descriptionMatch: stored.weights?.descriptionMatch ?? base.weights.descriptionMatch,
            },
        };
    }

    private inputToStoredConfig(input: AutoMapperConfigInput): StoredAutoMapperConfig {
        const stored: StoredAutoMapperConfig = {};

        if (input.confidenceThreshold !== undefined) {
            stored.confidenceThreshold = input.confidenceThreshold;
        }
        if (input.enableFuzzyMatching !== undefined) {
            stored.enableFuzzyMatching = input.enableFuzzyMatching;
        }
        if (input.enableTypeInference !== undefined) {
            stored.enableTypeInference = input.enableTypeInference;
        }
        if (input.caseSensitive !== undefined) {
            stored.caseSensitive = input.caseSensitive;
        }
        if (input.customAliases !== undefined) {
            stored.customAliases = input.customAliases;
        }
        if (input.excludeFields !== undefined) {
            stored.excludeFields = input.excludeFields;
        }

        // Handle weights
        if (
            input.weightNameSimilarity !== undefined ||
            input.weightTypeCompatibility !== undefined ||
            input.weightDescriptionMatch !== undefined
        ) {
            stored.weights = {};
            if (input.weightNameSimilarity !== undefined) {
                stored.weights.nameSimilarity = input.weightNameSimilarity;
            }
            if (input.weightTypeCompatibility !== undefined) {
                stored.weights.typeCompatibility = input.weightTypeCompatibility;
            }
            if (input.weightDescriptionMatch !== undefined) {
                stored.weights.descriptionMatch = input.weightDescriptionMatch;
            }
        }

        return stored;
    }
}
