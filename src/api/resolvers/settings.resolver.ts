import { Mutation, Query, Resolver, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { DATAHUB_PLUGIN_OPTIONS, LogPersistenceLevel } from '../../constants/index';
import { DataHubPluginOptions } from '../../types/index';
import { Allow, ID } from '@vendure/core';
import { DataHubPipelinePermission, UpdateDataHubSettingsPermission } from '../../permissions';
import { DataHubSettingsService, DataHubSettingsInput } from '../../services';
import { AutoMapperConfigInput } from '../../mappers';

/**
 * GraphQL input for AutoMapper configuration
 */
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

/**
 * GraphQL input for settings
 */
interface SettingsGraphQLInput {
    retentionDaysRuns?: number | null;
    retentionDaysErrors?: number | null;
    retentionDaysLogs?: number | null;
    logPersistenceLevel?: string;
}

@Resolver()
export class DataHubSettingsAdminResolver {
    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS) private opts: DataHubPluginOptions,
        private settings: DataHubSettingsService,
    ) {}

    // SETTINGS QUERIES

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubSettings() {
        return (async () => {
            const fromDb = await this.settings.get();
            return {
                retentionDaysRuns: (fromDb.retentionDaysRuns ?? this.opts.retentionDaysRuns ?? null) as any,
                retentionDaysErrors: (fromDb.retentionDaysErrors ?? this.opts.retentionDaysErrors ?? null) as any,
                retentionDaysLogs: fromDb.retentionDaysLogs ?? null,
                logPersistenceLevel: fromDb.logPersistenceLevel ?? LogPersistenceLevel.PIPELINE,
            } as any;
        })();
    }

    // SETTINGS MUTATIONS

    @Mutation()
    @Allow(UpdateDataHubSettingsPermission.Permission)
    async setDataHubSettings(@Args('input') input: SettingsGraphQLInput) {
        const normalized: DataHubSettingsInput = {};
        if (input.retentionDaysRuns !== undefined) {
            const n = input.retentionDaysRuns;
            normalized.retentionDaysRuns = n == null ? null : Math.max(0, Number(n));
        }
        if (input.retentionDaysErrors !== undefined) {
            const n = input.retentionDaysErrors;
            normalized.retentionDaysErrors = n == null ? null : Math.max(0, Number(n));
        }
        if (input.retentionDaysLogs !== undefined) {
            const n = input.retentionDaysLogs;
            normalized.retentionDaysLogs = n == null ? null : Math.max(0, Number(n));
        }
        if (input.logPersistenceLevel !== undefined) {
            // Validate and convert to enum
            const level = input.logPersistenceLevel as LogPersistenceLevel;
            if (Object.values(LogPersistenceLevel).includes(level)) {
                normalized.logPersistenceLevel = level;
            }
        }
        const saved = await this.settings.set(normalized);
        return saved as any;
    }

    // AUTOMAPPER QUERIES

    /**
     * Get AutoMapper configuration (global or per-pipeline)
     * Returns the effective configuration with all defaults applied
     */
    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubAutoMapperConfig(@Args('pipelineId') pipelineId?: ID) {
        const config = await this.settings.getAutoMapperConfig(pipelineId);
        return config;
    }

    /**
     * Get the default AutoMapper configuration
     * Returns the built-in defaults without any user customizations
     */
    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubAutoMapperDefaultConfig() {
        return this.settings.getDefaultAutoMapperConfig();
    }

    // AUTOMAPPER MUTATIONS

    /**
     * Update AutoMapper configuration
     * Supports both global configuration and per-pipeline overrides
     */
    @Mutation()
    @Allow(UpdateDataHubSettingsPermission.Permission)
    async updateDataHubAutoMapperConfig(@Args('input') input: AutoMapperConfigGraphQLInput) {
        // Validate input first
        const validation = this.settings.validateAutoMapperConfig(this.graphqlInputToConfigInput(input));
        if (!validation.valid) {
            throw new Error(`Invalid AutoMapper configuration: ${validation.errors.join(', ')}`);
        }

        const configInput: AutoMapperConfigInput & { pipelineId?: ID } = {
            ...this.graphqlInputToConfigInput(input),
            pipelineId: input.pipelineId,
        };

        return this.settings.updateAutoMapperConfig(configInput);
    }

    /**
     * Reset AutoMapper configuration to defaults
     * If pipelineId is provided, only resets that pipeline's config
     * Otherwise resets the global config
     */
    @Mutation()
    @Allow(UpdateDataHubSettingsPermission.Permission)
    async resetDataHubAutoMapperConfig(@Args('pipelineId') pipelineId?: ID) {
        return this.settings.resetAutoMapperConfig(pipelineId);
    }

    /**
     * Validate AutoMapper configuration without saving
     * Useful for UI validation before submission
     */
    @Mutation()
    @Allow(DataHubPipelinePermission.Read)
    validateDataHubAutoMapperConfig(@Args('input') input: AutoMapperConfigGraphQLInput) {
        return this.settings.validateAutoMapperConfig(this.graphqlInputToConfigInput(input));
    }

    // HELPER METHODS

    /**
     * Convert GraphQL input to internal AutoMapperConfigInput format
     */
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
