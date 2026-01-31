import { Injectable } from '@nestjs/common';
import { RequestContextService, TransactionalConnection, ID } from '@vendure/core';
import { DataHubSettings, StoredAutoMapperConfig } from '../../entities/config';
import { LogPersistenceLevel, SortOrder } from '../../constants/enums';
import {
    AutoMapperConfig,
    AutoMapperConfigInput,
    DEFAULT_AUTO_MAPPER_CONFIG,
    validateAutoMapperConfig,
    AutoMapperConfigValidation,
} from '../../mappers';

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
    constructor(private connection: TransactionalConnection, private ctxService: RequestContextService) {}

    private async getCtx() {
        return this.ctxService.create({ apiType: 'admin' });
    }

    /**
     * Get or create the settings row
     */
    private async getSettingsRow(): Promise<DataHubSettings> {
        const ctx = await this.getCtx();
        const repo = this.connection.getRepository(ctx, DataHubSettings);
        let row = await repo.createQueryBuilder('s').orderBy('s.id', SortOrder.ASC).getOne();
        if (!row) {
            row = new DataHubSettings();
            row.retentionDaysRuns = null;
            row.retentionDaysErrors = null;
            row.retentionDaysLogs = null;
            row.logPersistenceLevel = LogPersistenceLevel.PIPELINE;
            row.autoMapperConfig = null;
            row.pipelineAutoMapperConfigs = null;
        }
        return row;
    }

    async get(): Promise<DataHubSettingsResult> {
        const row = await this.getSettingsRow();
        return {
            retentionDaysRuns: row?.retentionDaysRuns ?? null,
            retentionDaysErrors: row?.retentionDaysErrors ?? null,
            retentionDaysLogs: row?.retentionDaysLogs ?? null,
            logPersistenceLevel: row?.logPersistenceLevel ?? LogPersistenceLevel.PIPELINE,
        };
    }

    async set(input: DataHubSettingsInput): Promise<DataHubSettingsResult> {
        const ctx = await this.getCtx();
        const repo = this.connection.getRepository(ctx, DataHubSettings);
        const row = await this.getSettingsRow();
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
        const saved = await repo.save(row);
        return {
            retentionDaysRuns: saved.retentionDaysRuns ?? null,
            retentionDaysErrors: saved.retentionDaysErrors ?? null,
            retentionDaysLogs: saved.retentionDaysLogs ?? null,
            logPersistenceLevel: saved.logPersistenceLevel ?? LogPersistenceLevel.PIPELINE,
        };
    }

    /**
     * Get just the log persistence level (for use in pipeline execution)
     */
    async getLogPersistenceLevel(): Promise<LogPersistenceLevel> {
        const row = await this.getSettingsRow();
        return row?.logPersistenceLevel ?? LogPersistenceLevel.PIPELINE;
    }

    /**
     * Get AutoMapper configuration (global or per-pipeline)
     * @param pipelineId - Optional pipeline ID for per-pipeline config
     * @returns Full AutoMapperConfig with defaults applied
     */
    async getAutoMapperConfig(pipelineId?: ID | null): Promise<AutoMapperConfig> {
        const row = await this.getSettingsRow();

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

    /**
     * Get the default AutoMapper configuration
     */
    getDefaultAutoMapperConfig(): AutoMapperConfig {
        return { ...DEFAULT_AUTO_MAPPER_CONFIG };
    }

    /**
     * Update AutoMapper configuration
     * @param input - Configuration input with optional pipelineId
     * @returns Updated configuration with defaults applied
     */
    async updateAutoMapperConfig(input: AutoMapperConfigInput & { pipelineId?: ID | null }): Promise<AutoMapperConfig> {
        const ctx = await this.getCtx();
        const repo = this.connection.getRepository(ctx, DataHubSettings);
        const row = await this.getSettingsRow();

        const storedConfig = this.inputToStoredConfig(input);

        if (input.pipelineId) {
            // Update pipeline-specific config
            if (!row.pipelineAutoMapperConfigs) {
                row.pipelineAutoMapperConfigs = {};
            }
            const pipelineId = String(input.pipelineId);
            row.pipelineAutoMapperConfigs[pipelineId] = {
                ...row.pipelineAutoMapperConfigs[pipelineId],
                ...storedConfig,
            };
        } else {
            // Update global config
            row.autoMapperConfig = {
                ...row.autoMapperConfig,
                ...storedConfig,
            };
        }

        await repo.save(row);

        // Return the merged config
        return this.getAutoMapperConfig(input.pipelineId);
    }

    /**
     * Reset AutoMapper configuration to defaults
     * @param pipelineId - Optional pipeline ID to reset specific pipeline config
     * @returns Default configuration
     */
    async resetAutoMapperConfig(pipelineId?: ID | null): Promise<AutoMapperConfig> {
        const ctx = await this.getCtx();
        const repo = this.connection.getRepository(ctx, DataHubSettings);
        const row = await this.getSettingsRow();

        if (pipelineId) {
            // Remove pipeline-specific config
            if (row.pipelineAutoMapperConfigs) {
                delete row.pipelineAutoMapperConfigs[String(pipelineId)];
            }
        } else {
            // Reset global config
            row.autoMapperConfig = null;
        }

        await repo.save(row);

        // Return the config after reset (may still have some inherited values)
        return this.getAutoMapperConfig(pipelineId);
    }

    /**
     * Validate AutoMapper configuration input
     */
    validateAutoMapperConfig(input: AutoMapperConfigInput): AutoMapperConfigValidation {
        return validateAutoMapperConfig(input);
    }

    /**
     * Merge stored config into base config
     */
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

    /**
     * Convert GraphQL input to stored config format
     */
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

