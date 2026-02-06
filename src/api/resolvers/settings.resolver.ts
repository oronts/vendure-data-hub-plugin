import { Mutation, Query, Resolver, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { DATAHUB_PLUGIN_OPTIONS, LogPersistenceLevel, RESOLVER_ERROR_MESSAGES } from '../../constants/index';
import { DataHubPluginOptions } from '../../types/index';
import { Allow, ID, Transaction } from '@vendure/core';
import { DataHubPipelinePermission, UpdateDataHubSettingsPermission } from '../../permissions';
import { DataHubSettingsService, DataHubSettingsInput } from '../../services';
import { AutoMapperConfigInput } from '../../mappers';

interface AutoMapperConfigGraphQLInput {
    confidenceThreshold?: number;
    enableFuzzyMatching?: boolean;
    enableTypeInference?: boolean;
    caseSensitive?: boolean;
    customAliases?: Record<string, string[]>;
    excludeFields?: string[];
    weights?: {
        nameSimilarity?: number;
        typeCompatibility?: number;
        descriptionMatch?: number;
    };
    pipelineId?: ID;
}

interface SettingsGraphQLInput {
    retentionDaysRuns?: number | null;
    retentionDaysErrors?: number | null;
    retentionDaysLogs?: number | null;
    logPersistenceLevel?: string;
}

const MAX_RETENTION_DAYS = 3650; // 10 years maximum

@Resolver()
export class DataHubSettingsAdminResolver {
    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS) private opts: DataHubPluginOptions,
        private settings: DataHubSettingsService,
    ) {}

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubSettings() {
        const fromDb = await this.settings.get();
        return {
            retentionDaysRuns: fromDb.retentionDaysRuns ?? this.opts.retentionDaysRuns ?? null,
            retentionDaysErrors: fromDb.retentionDaysErrors ?? this.opts.retentionDaysErrors ?? null,
            retentionDaysLogs: fromDb.retentionDaysLogs ?? null,
            logPersistenceLevel: fromDb.logPersistenceLevel ?? LogPersistenceLevel.PIPELINE,
        };
    }

    @Mutation()
    @Transaction()
    @Allow(UpdateDataHubSettingsPermission.Permission)
    async updateDataHubSettings(@Args('input') input: SettingsGraphQLInput) {
        const normalized: DataHubSettingsInput = {};
        if (input.retentionDaysRuns !== undefined) {
            normalized.retentionDaysRuns = input.retentionDaysRuns == null
                ? null
                : Math.min(MAX_RETENTION_DAYS, Math.max(0, Number(input.retentionDaysRuns)));
        }
        if (input.retentionDaysErrors !== undefined) {
            normalized.retentionDaysErrors = input.retentionDaysErrors == null
                ? null
                : Math.min(MAX_RETENTION_DAYS, Math.max(0, Number(input.retentionDaysErrors)));
        }
        if (input.retentionDaysLogs !== undefined) {
            normalized.retentionDaysLogs = input.retentionDaysLogs == null
                ? null
                : Math.min(MAX_RETENTION_DAYS, Math.max(0, Number(input.retentionDaysLogs)));
        }
        if (input.logPersistenceLevel !== undefined) {
            const level = input.logPersistenceLevel as LogPersistenceLevel;
            if (Object.values(LogPersistenceLevel).includes(level)) {
                normalized.logPersistenceLevel = level;
            }
        }
        return this.settings.set(normalized);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubAutoMapperConfig(@Args('pipelineId') pipelineId?: ID) {
        return this.settings.getAutoMapperConfig(pipelineId);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubAutoMapperDefaultConfig() {
        return this.settings.getDefaultAutoMapperConfig();
    }

    @Mutation()
    @Transaction()
    @Allow(UpdateDataHubSettingsPermission.Permission)
    async updateDataHubAutoMapperConfig(@Args('input') input: AutoMapperConfigGraphQLInput) {
        const validation = this.settings.validateAutoMapperConfig(this.graphqlInputToConfigInput(input));
        if (!validation.valid) {
            throw new Error(RESOLVER_ERROR_MESSAGES.INVALID_AUTOMAPPER_CONFIG(validation.errors));
        }

        const configInput: AutoMapperConfigInput & { pipelineId?: ID } = {
            ...this.graphqlInputToConfigInput(input),
            pipelineId: input.pipelineId,
        };

        return this.settings.updateAutoMapperConfig(configInput);
    }

    @Mutation()
    @Transaction()
    @Allow(UpdateDataHubSettingsPermission.Permission)
    async resetDataHubAutoMapperConfig(@Args('pipelineId') pipelineId?: ID) {
        return this.settings.resetAutoMapperConfig(pipelineId);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    validateDataHubAutoMapperConfig(@Args('input') input: AutoMapperConfigGraphQLInput) {
        return this.settings.validateAutoMapperConfig(this.graphqlInputToConfigInput(input));
    }

    private graphqlInputToConfigInput(input: AutoMapperConfigGraphQLInput): AutoMapperConfigInput {
        return {
            confidenceThreshold: input.confidenceThreshold,
            enableFuzzyMatching: input.enableFuzzyMatching,
            enableTypeInference: input.enableTypeInference,
            caseSensitive: input.caseSensitive,
            customAliases: input.customAliases,
            excludeFields: input.excludeFields,
            weightNameSimilarity: input.weights?.nameSimilarity,
            weightTypeCompatibility: input.weights?.typeCompatibility,
            weightDescriptionMatch: input.weights?.descriptionMatch,
        };
    }
}
