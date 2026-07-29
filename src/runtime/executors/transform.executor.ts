import { Injectable, Optional } from '@nestjs/common';
import { ID, RequestContext } from '@vendure/core';
import { JsonValue, PipelineStepDefinition, PipelineContext, VendureEntityType } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { RecordObject, OnRecordErrorCallback, ExecutorContext, BranchOutput, SANDBOX_PIPELINE_ID } from '../executor-types';
import {
    getPath,
    evalCondition,
} from '../utils';
import { DataHubRegistryService } from '../../sdk/registry.service';
import {
    EnrichContext,
    EnricherAdapter,
} from '../../sdk/types';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { SchemaRegistryService } from '../../services/schema/schema-registry.service';
import { LoaderRegistryService } from '../../loaders/registry';
import {
    createConnectionsAdapter,
    createLoggerAdapter,
    createSecretsAdapter,
} from './context-adapters';
import { applyHttpLookupBatch } from '../../operators/enrichment/helpers';
import type { HttpLookupOperatorConfig } from '../../operators/enrichment/types';
import { getErrorMessage } from '../../utils/error.utils';
import { validateEnrichmentConfig } from '../../validation/enrichment-config.validator';
import {
    getAdapterCode,
    TransformStepConfig,
    BranchConfig,
} from '../../types/step-configs';

import { TransformOperatorRunner } from './transform-operator-runner';
import { createOptionalSecretResolver } from './transform-operator-helpers';
import { TransformValidationRunner } from './transform-validation-runner';

export { OperatorNotFoundError } from './transform-operator-runner';

export class EnrichmentConfigurationError extends Error {
    constructor(
        public readonly stepKey: string,
        public readonly reasons: readonly string[],
    ) {
        super(`Invalid ENRICH configuration for step "${stepKey}": ${reasons.join('; ')}`);
        this.name = 'EnrichmentConfigurationError';
    }
}

@Injectable()
export class TransformExecutor {
    private readonly logger: DataHubLogger;
    private readonly operatorRunner: TransformOperatorRunner;
    private readonly validationRunner: TransformValidationRunner;

    constructor(
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
        @Optional() private secretService?: SecretService,
        @Optional() private loaderRegistry?: LoaderRegistryService,
        @Optional() private connectionService?: ConnectionService,
        @Optional() private schemaRegistry?: SchemaRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.TRANSFORM_EXECUTOR);
        this.operatorRunner = new TransformOperatorRunner(
            this.logger,
            this.registry,
            this.secretService,
            this.connectionService,
        );
        this.validationRunner = new TransformValidationRunner(
            this.logger,
            this.registry,
            this.schemaRegistry,
        );
    }

    async executeOperator(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        executorCtx: ExecutorContext,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        return this.operatorRunner.execute(
            ctx,
            step,
            input,
            executorCtx,
            pipelineContext,
            pipelineId,
        );
    }

    async executeValidate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        return this.validationRunner.execute(
            ctx,
            step,
            input,
            onRecordError,
            pipelineContext,
            pipelineId,
        );
    }

    /**
     * Execute an enrich step on the input records using built-in enrichment config.
     * Supports:
     * - defaults: Static default values to add to records
     * - computed: Computed field expressions (template syntax)
     * - sourceType: STATIC (inline defaults), HTTP (external API), VENDURE (entity lookup)
     * If adapterCode is provided, dispatches the registered enricher runtime.
     */
    async executeEnrich(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        _executorCtx?: ExecutorContext,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const cfg = (step.config ?? {}) as Record<string, unknown>;
        const adapterCode = getAdapterCode(step);

        if (adapterCode) {
            return this.executeCustomEnricher(
                ctx,
                step,
                input,
                adapterCode,
                pipelineContext,
                pipelineId,
            );
        }

        const validation = validateEnrichmentConfig(cfg);
        if (!validation.sourceType || validation.issues.length > 0) {
            throw new EnrichmentConfigurationError(
                step.key,
                validation.issues.map(issue => issue.message),
            );
        }
        const sourceType = validation.sourceType;

        if (sourceType === 'STATIC') {
            // Apply static defaults/set values to each record
            const defaults = cfg.defaults as Record<string, unknown> | undefined ?? {};
            const setValues = cfg.set as Record<string, unknown> | undefined ?? {};
            const computed = cfg.computed as Record<string, string> | undefined ?? {};

            return input.map(record => {
                const enriched = { ...record };

                // Apply defaults (only if field doesn't exist or is null/undefined)
                for (const [key, value] of Object.entries(defaults)) {
                    if (enriched[key] === undefined || enriched[key] === null) {
                        enriched[key] = value as JsonValue;
                    }
                }

                // Apply set values (always overwrite)
                for (const [key, value] of Object.entries(setValues)) {
                    enriched[key] = value as JsonValue;
                }

                // Apply computed fields (template syntax with ${field} placeholders)
                for (const [key, template] of Object.entries(computed)) {
                    if (typeof template === 'string') {
                        enriched[key] = template.replace(/\$\{([^}]+)\}/g, (_, p) => {
                            const value = getPath(enriched, p.trim());
                            return value != null ? String(value) : '';
                        });
                    }
                }

                return enriched;
            });
        }

        if (sourceType === 'HTTP') {
            return this.executeEnrichHttp(ctx, step, input, _executorCtx);
        }

        if (sourceType === 'VENDURE') {
            return this.executeEnrichVendure(ctx, step, input);
        }

        throw new EnrichmentConfigurationError(step.key, [
            `Unsupported sourceType ${String(sourceType)}`,
        ]);
    }

    private async executeCustomEnricher(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        adapterCode: string,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const adapter = this.registry?.getRuntime('ENRICHER', adapterCode) as
            | EnricherAdapter<unknown>
            | undefined;
        if (!adapter || typeof adapter.enrich !== 'function') {
            throw new Error(`Enricher adapter '${adapterCode}' is not registered for runtime execution`);
        }
        if (!this.secretService || !this.connectionService) {
            throw new Error(`Enricher adapter '${adapterCode}' requires secret and connection services`);
        }

        const context: EnrichContext = {
            ctx,
            pipelineId: pipelineId ?? SANDBOX_PIPELINE_ID,
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(this.connectionService, ctx),
            logger: createLoggerAdapter(this.logger),
        };
        const result = await adapter.enrich(context, step.config ?? {}, input);
        if (!Array.isArray(result.records)) {
            throw new Error(`Enricher adapter '${adapterCode}' returned an invalid result`);
        }
        if (result.errors && result.errors.length > 0) {
            this.logger.warn('Custom enricher completed with record errors', {
                adapterCode,
                stepKey: step.key,
                errorCount: result.errors.length,
                firstError: result.errors[0].message,
            });
        }
        return result.records as RecordObject[];
    }

    /**
     * Execute HTTP enrichment by performing HTTP lookups for each record.
     * Delegates to the applyHttpLookupBatch helper which handles caching,
     * circuit breaking, rate limiting, and retries.
     */
    private async executeEnrichHttp(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        _executorCtx?: ExecutorContext,
    ): Promise<RecordObject[]> {
        const cfg = (step.config ?? {}) as Record<string, unknown>;

        const url = cfg.url as string | undefined;
        if (!url) {
            throw new EnrichmentConfigurationError(step.key, ['url must be a non-empty string']);
        }

        const httpConfig: HttpLookupOperatorConfig = {
            url,
            connectionCode: cfg.connectionCode as string | undefined,
            method: (cfg.method as 'GET' | 'POST') ?? 'GET',
            keyField: cfg.keyField as string | undefined,
            target: (cfg.target as string) ?? 'enrichment',
            responsePath: cfg.responsePath as string | undefined,
            default: cfg.default as JsonValue | undefined,
            timeoutMs: cfg.timeoutMs as number | undefined,
            cacheTtlSec: cfg.cacheTtlSec as number | undefined,
            headers: cfg.headers as Record<string, string> | undefined,
            bearerTokenSecretCode: cfg.bearerTokenSecretCode as string | undefined,
            apiKeySecretCode: cfg.apiKeySecretCode as string | undefined,
            apiKeyHeader: cfg.apiKeyHeader as string | undefined,
            basicAuthSecretCode: cfg.basicAuthSecretCode as string | undefined,
            bodyField: cfg.bodyField as string | undefined,
            body: cfg.body as JsonValue | undefined,
            skipOn404: cfg.skipOn404 as boolean | undefined,
            failOnError: cfg.failOnError as boolean | undefined,
            maxRetries: cfg.maxRetries as number | undefined,
            batchSize: cfg.batchSize as number | undefined,
            rateLimitPerSecond: cfg.rateLimitPerSecond as number | undefined,
        };

        const secretResolver = createOptionalSecretResolver(
            this.secretService,
            ctx,
        );

        const { records, errors } = await applyHttpLookupBatch(
            input,
            httpConfig,
            {
                secrets: secretResolver,
                connections: this.connectionService
                    ? createConnectionsAdapter(this.connectionService, ctx)
                    : undefined,
            },
        );

        if (errors.length > 0) {
            this.logger.warn(
                `ENRICH HTTP step "${step.key}" had ${errors.length} lookup error(s)`,
            );
        }

        return records as RecordObject[];
    }

    /**
     * Execute Vendure entity enrichment by looking up entities via the loader registry.
     * For each record, uses the configured sourceField to find a matching entity and
     * merges selected fields (or just the entity ID) into the record.
     */
    private async executeEnrichVendure(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<RecordObject[]> {
        const cfg = (step.config ?? {}) as Record<string, unknown>;
        const entityType = cfg.entityType as string | undefined;
        const sourceField = cfg.sourceField as string | undefined;
        const lookupField = cfg.lookupField as string | undefined;
        const targetFields = cfg.targetFields as Record<string, string> | undefined;
        const target = (cfg.target as string) || 'vendureData';

        if (!entityType || !sourceField || !lookupField) {
            throw new EnrichmentConfigurationError(step.key, [
                'entityType, sourceField, and lookupField must be non-empty strings',
            ]);
        }

        if (!this.loaderRegistry) {
            throw new EnrichmentConfigurationError(step.key, [
                'LoaderRegistryService is not available',
            ]);
        }

        const loader = this.loaderRegistry.get(entityType as VendureEntityType);
        if (!loader) {
            throw new EnrichmentConfigurationError(step.key, [
                `No loader is registered for entity type "${entityType}"`,
            ]);
        }

        const results: RecordObject[] = [];
        for (const record of input) {
            try {
                const lookupValue = record[sourceField];
                if (lookupValue === undefined || lookupValue === null) {
                    results.push(record);
                    continue;
                }

                const lookupRecord = { [lookupField]: lookupValue } as Record<string, unknown>;
                const existing = await loader.findExisting(ctx, [lookupField], lookupRecord);

                if (existing) {
                    const enriched = { ...record };
                    if (targetFields && Object.keys(targetFields).length > 0) {
                        const entity = existing.entity as Record<string, unknown>;
                        for (const [entityField, recordField] of Object.entries(targetFields)) {
                            const value = entity[entityField];
                            if (value !== undefined) {
                                enriched[recordField] = value as JsonValue;
                            }
                        }
                    } else {
                        enriched[target] = { id: String(existing.id) } as unknown as JsonValue;
                    }
                    results.push(enriched);
                } else {
                    results.push(record);
                }
            } catch (error) {
                this.logger.debug(
                    `ENRICH VENDURE lookup failed for record in step "${step.key}": ${getErrorMessage(error)}`,
                );
                results.push(record);
            }
        }

        return results;
    }

    /**
     * Execute a route step on the input records (returns first matching branch for linear pipelines)
     */
    async executeRoute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        _onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const cfg = step.config as TransformStepConfig | undefined;
        const branches: BranchConfig[] = cfg?.branches ?? [];
        if (!branches.length) return input;

        // For linear model, select first matching branch
        for (const b of branches) {
            const out = input.filter(rec => (b.when ?? []).every(cond => evalCondition(rec, cond)));
            if (out.length > 0) {
                const unmatchedCount = input.length - out.length;
                if (unmatchedCount > 0) {
                    this.logger.warn(`ROUTE step "${step.key}": ${unmatchedCount} record(s) matched no branch and were dropped`);
                }
                return out;
            }
        }
        if (input.length > 0) {
            this.logger.warn(`ROUTE step "${step.key}": ${input.length} record(s) matched no branch and were dropped`);
        }
        return [];
    }

    /**
     * Execute a route step on the input records (returns all branches for graph pipelines)
     */
    async executeRouteBranches(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<BranchOutput> {
        const cfg = step.config as TransformStepConfig | undefined;
        const branchesCfg: BranchConfig[] = cfg?.branches ?? [];
        const result: Record<string, RecordObject[]> = {};
        const matchedSet = new Set<number>();

        for (const b of branchesCfg) {
            const matched = input.filter((rec, idx) => {
                const isMatch = (b.when ?? []).every(cond => evalCondition(rec, cond));
                if (isMatch) matchedSet.add(idx);
                return isMatch;
            });
            result[b.name] = matched;
        }

        const defaultRecs = input.filter((_rec, idx) => !matchedSet.has(idx));
        result['default'] = defaultRecs;

        if (defaultRecs.length > 0) {
            this.logger.warn(`ROUTE step "${step.key}": ${defaultRecs.length} record(s) matched no branch and were routed to default`);
        }

        return { __branchOutputs: true, branches: result };
    }
}
