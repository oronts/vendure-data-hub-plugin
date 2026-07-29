import { Mutation, Query, Resolver, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { DATAHUB_PLUGIN_OPTIONS, LogPersistenceLevel, RESOLVER_ERROR_MESSAGES } from '../../constants/index';
import { DataHubPluginOptions } from '../../types/index';
import {
    Allow,
    Ctx,
    ID,
    RequestContext,
    Transaction,
    TransactionalConnection,
} from '@vendure/core';
import { DataHubPipelinePermission, UpdateDataHubSettingsPermission } from '../../permissions';
import { DataHubSettingsService, DataHubSettingsInput } from '../../services';
import { AutoMapperConfigInput } from '../../mappers';
import { Pipeline } from '../../entities';
import { normalizeRetentionDays } from '../../services/storage/retention-policy';

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

function isLogPersistenceLevel(value: string): value is LogPersistenceLevel {
    return Object.values(LogPersistenceLevel).some(level => level === value);
}

@Resolver()
export class DataHubSettingsAdminResolver {
    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS) private opts: DataHubPluginOptions,
        private settings: DataHubSettingsService,
        private connection: TransactionalConnection,
    ) {}

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubSettings(@Ctx() ctx: RequestContext) {
        const fromDb = await this.settings.get(ctx);
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
    async updateDataHubSettings(
        @Ctx() ctx: RequestContext,
        @Args('input') input: SettingsGraphQLInput,
    ) {
        const normalized: DataHubSettingsInput = {};
        if (input.retentionDaysRuns !== undefined) {
            normalized.retentionDaysRuns = normalizeRetentionDays(
                'retentionDaysRuns',
                input.retentionDaysRuns,
            );
        }
        if (input.retentionDaysErrors !== undefined) {
            normalized.retentionDaysErrors = normalizeRetentionDays(
                'retentionDaysErrors',
                input.retentionDaysErrors,
            );
        }
        if (input.retentionDaysLogs !== undefined) {
            normalized.retentionDaysLogs = normalizeRetentionDays(
                'retentionDaysLogs',
                input.retentionDaysLogs,
            );
        }
        if (input.logPersistenceLevel !== undefined) {
            if (!isLogPersistenceLevel(input.logPersistenceLevel)) {
                throw new Error(
                    RESOLVER_ERROR_MESSAGES.INVALID_LOG_PERSISTENCE_LEVEL(
                        input.logPersistenceLevel,
                    ),
                );
            }
            normalized.logPersistenceLevel = input.logPersistenceLevel;
        }
        return this.settings.set(normalized, ctx);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubAutoMapperConfig(
        @Ctx() ctx: RequestContext,
        @Args('pipelineId') pipelineId?: ID,
    ) {
        await this.assertPipelineVisible(ctx, pipelineId);
        return this.settings.getAutoMapperConfig(pipelineId, ctx);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubAutoMapperDefaultConfig() {
        return this.settings.getDefaultAutoMapperConfig();
    }

    @Mutation()
    @Transaction()
    @Allow(UpdateDataHubSettingsPermission.Permission)
    async updateDataHubAutoMapperConfig(
        @Ctx() ctx: RequestContext,
        @Args('input') input: AutoMapperConfigGraphQLInput,
    ) {
        await this.assertPipelineVisible(ctx, input.pipelineId);
        const validation = this.settings.validateAutoMapperConfig(this.graphqlInputToConfigInput(input));
        if (!validation.valid) {
            throw new Error(RESOLVER_ERROR_MESSAGES.INVALID_AUTOMAPPER_CONFIG(validation.errors));
        }

        const configInput: AutoMapperConfigInput & { pipelineId?: ID } = {
            ...this.graphqlInputToConfigInput(input),
            pipelineId: input.pipelineId,
        };

        return this.settings.updateAutoMapperConfig(configInput, ctx);
    }

    @Mutation()
    @Transaction()
    @Allow(UpdateDataHubSettingsPermission.Permission)
    async resetDataHubAutoMapperConfig(
        @Ctx() ctx: RequestContext,
        @Args('pipelineId') pipelineId?: ID,
    ) {
        await this.assertPipelineVisible(ctx, pipelineId);
        return this.settings.resetAutoMapperConfig(pipelineId, ctx);
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

    private async assertPipelineVisible(
        ctx: RequestContext,
        pipelineId?: ID,
    ): Promise<void> {
        if (pipelineId === undefined || pipelineId === null) {
            return;
        }

        await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId, {
            channelId: ctx.channelId,
        });
    }
}
