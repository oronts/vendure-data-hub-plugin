import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonObject, JsonValue, PipelineStepDefinition, PipelineContext } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS, ValidationMode } from '../../constants/index';
import { RecordObject, OnRecordErrorCallback, ExecutorContext, BranchOutput } from '../executor-types';
import {
    getPath,
    setPath,
    evalCondition,
    unitFactor,
    validateAgainstSimpleSpec,
} from '../utils';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { OperatorAdapter, SingleRecordOperator, AdapterOperatorHelpers, OperatorContext } from '../../sdk/types';
import { getOperatorRuntime, getCustomOperatorRuntime } from '../../operators/operator-runtime-registry';
import { OperatorSecretResolver } from '../../sdk/types/transform-types';
import { hashStable } from '../utils';
import { SecretService } from '../../services/config/secret.service';
import { getErrorMessage } from '../../utils/error.utils';
import {
    getAdapterCode,
    isTransformStepConfig,
    TransformStepConfig,
    OperatorConfig,
    BranchConfig,
} from '../../types/step-configs';

/**
 * Error thrown when an operator is not found in the registry
 */
export class OperatorNotFoundError extends Error {
    constructor(
        public readonly operatorCode: string,
        public readonly stepKey: string,
    ) {
        super(`Operator '${operatorCode}' not found in registry. Step: ${stepKey}. ` +
            `Ensure the operator is properly registered. Available operators can be queried via the DataHub API.`);
        this.name = 'OperatorNotFoundError';
    }
}

@Injectable()
export class TransformExecutor {
    private readonly logger: DataHubLogger;

    constructor(
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
        @Optional() private secretService?: SecretService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.TRANSFORM_EXECUTOR);
    }

    /**
     * Execute a transform/operator step on the input records
     * Supports both single-operator (adapterCode) and multi-operator (operators array) formats
     *
     * All operators are resolved via the registry - no hard-coded implementations.
     * Throws OperatorNotFoundError if an operator is not found.
     */
    async executeOperator(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        executorCtx: ExecutorContext,
        pipelineContext?: PipelineContext,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;
        const adapterCode = getAdapterCode(step);
        const operatorsArray: OperatorConfig[] | undefined = isTransformStepConfig(cfg)
            ? (cfg as TransformStepConfig).operators
            : undefined;

        this.logger.debug(`Executing transform step`, {
            stepKey: step.key,
            adapterCode: adapterCode || undefined,
            operatorCount: operatorsArray?.length,
            recordCount: input.length,
        });

        // Handle multi-operator array format
        if (operatorsArray && operatorsArray.length > 0) {
            return await this.executeOperatorsArray(ctx, step, input, operatorsArray, executorCtx, pipelineContext);
        }

        // Handle single operator format
        if (!adapterCode) {
            this.logger.warn(`No operator specified for transform step`, { stepKey: step.key });
            return input;
        }

        return await this.executeSingleOperator(ctx, step, input, adapterCode, cfg, executorCtx, pipelineContext);
    }

    /**
     * Execute a single operator via registry lookup
     * Throws OperatorNotFoundError if operator not found
     */
    private async executeSingleOperator(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        adapterCode: string,
        cfg: JsonObject,
        executorCtx: ExecutorContext,
        pipelineContext?: PipelineContext,
    ): Promise<RecordObject[]> {
        // Try built-in first
        let operator: OperatorAdapter<unknown> | SingleRecordOperator<unknown> | undefined =
            getOperatorRuntime(adapterCode);
        // Fallback to custom registry
        if (!operator) {
            operator = getCustomOperatorRuntime(this.registry, adapterCode);
        }
        if (!operator) {
            throw new OperatorNotFoundError(adapterCode, step.key);
        }

        // Check if it's an operator type (has apply or applyOne method)
        if (!('apply' in operator || 'applyOne' in operator)) {
            throw new Error(`Adapter '${adapterCode}' is not an operator (missing apply/applyOne method). Step: ${step.key}`);
        }

        return await this.executeCustomOperator(
            ctx,
            step,
            input,
            operator as OperatorAdapter<unknown> | SingleRecordOperator<unknown>,
            pipelineContext,
        );
    }

    /**
     * Execute an array of operators sequentially
     * Each operator's output becomes the input for the next
     * Throws OperatorNotFoundError if any operator is not found
     */
    private async executeOperatorsArray(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        operators: OperatorConfig[],
        executorCtx: ExecutorContext,
        pipelineContext?: PipelineContext,
    ): Promise<RecordObject[]> {
        let currentRecords = input;

        for (let i = 0; i < operators.length; i++) {
            const opConfig = operators[i];
            const opCode = opConfig.op;
            const args = opConfig.args ?? {};

            this.logger.debug(`Executing operator ${i + 1}/${operators.length}`, {
                stepKey: step.key,
                op: opCode,
                recordCount: currentRecords.length,
            });

            const syntheticStep: PipelineStepDefinition = {
                ...step,
                config: { adapterCode: opCode, ...args },
            };

            currentRecords = await this.executeSingleOperator(
                ctx,
                syntheticStep,
                currentRecords,
                opCode,
                { adapterCode: opCode, ...args } as JsonObject,
                executorCtx,
                pipelineContext,
            );
        }

        return currentRecords;
    }

    /**
     * Prepare the operator context with logger and pipeline information
     */
    private prepareCustomContext(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        pipelineContext?: PipelineContext,
    ): OperatorContext {
        return {
            ctx,
            pipelineId: '0',
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            logger: {
                info: (msg: string, meta?: JsonObject) => this.logger.info(msg, meta as Record<string, unknown> | undefined),
                warn: (msg: string, meta?: JsonObject) => this.logger.warn(msg, meta as Record<string, unknown> | undefined),
                error: (msg: string, errorOrMeta?: JsonObject | Error, meta?: JsonObject) => {
                    const error = errorOrMeta instanceof Error ? errorOrMeta : undefined;
                    const metadata = errorOrMeta instanceof Error ? meta : errorOrMeta;
                    this.logger.error(msg, error, metadata as Record<string, unknown> | undefined);
                },
                debug: (msg: string, meta?: JsonObject) => this.logger.debug(msg, meta as Record<string, unknown> | undefined),
            },
        };
    }

    /**
     * Build the secret resolution function for operator helpers
     */
    private createSecretResolver(ctx: RequestContext): OperatorSecretResolver | undefined {
        if (!this.secretService) {
            return undefined;
        }
        return {
            get: async (code: string): Promise<string | undefined> => {
                try {
                    const value = await this.secretService?.resolve(ctx, code);
                    return value ?? undefined;
                } catch {
                    return undefined;
                }
            },
        };
    }

    /**
     * Build get/set/remove path helpers for operator helpers
     */
    private buildPathHelpers(): Pick<AdapterOperatorHelpers, 'get' | 'set' | 'remove'> {
        return {
            get: (record: JsonObject, path: string) => getPath(record as RecordObject, path),
            set: (record: JsonObject, path: string, value: JsonValue) => setPath(record as RecordObject, path, value),
            remove: (record: JsonObject, path: string) => {
                const parts = path.split('.');
                let cur: JsonObject | undefined = record;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (cur == null) return;
                    const val = cur[parts[i]];
                    if (typeof val !== 'object' || val === null || Array.isArray(val)) return;
                    cur = val as JsonObject;
                }
                if (cur) delete cur[parts[parts.length - 1]];
            },
        };
    }

    /**
     * Build format utilities (currency, date, number, template) for operator helpers
     */
    private buildFormatHelpers(): AdapterOperatorHelpers['format'] {
        return {
            currency: (amount: number, currencyCode: string, locale?: string) => {
                return new Intl.NumberFormat(locale ?? 'en-US', { style: 'currency', currency: currencyCode }).format(amount);
            },
            date: (date: Date | string | number, _format: string) => {
                const dateObj = new Date(date);
                return dateObj.toISOString();
            },
            number: (value: number, decimals?: number, locale?: string) => {
                return new Intl.NumberFormat(locale ?? 'en-US', { maximumFractionDigits: decimals ?? 2 }).format(value);
            },
            template: (template: string, data: JsonObject) => {
                return template.replace(/\{\{([^}]+)\}\}/g, (_m, p1) => {
                    const pathValue = getPath(data as RecordObject, String(p1).trim());
                    return pathValue == null ? '' : String(pathValue);
                });
            },
        };
    }

    /**
     * Build convert utilities for operator helpers
     */
    private buildConvertHelpers(): AdapterOperatorHelpers['convert'] {
        return {
            toMinorUnits: (amount: number, decimals = 2) => Math.round(amount * Math.pow(10, decimals)),
            fromMinorUnits: (amount: number, decimals = 2) => amount / Math.pow(10, decimals),
            unit: (value: number, from: string, to: string) => unitFactor(from, to) * value,
            parseDate: (value: string, _format?: string) => {
                const dateObj = new Date(value);
                return isNaN(dateObj.getTime()) ? null : dateObj;
            },
        };
    }

    /**
     * Build crypto utilities for operator helpers
     */
    private buildCryptoHelpers(): AdapterOperatorHelpers['crypto'] {
        return {
            hash: (value: string, _algorithm?: 'md5' | 'sha256' | 'sha512') => hashStable(value),
            hmac: (value: string, secret: string, _algorithm?: 'sha256' | 'sha512') => {
                return hashStable(value + secret);
            },
            uuid: () => crypto.randomUUID(),
        };
    }

    /**
     * Load custom operator helpers including secret resolver and utility functions
     */
    private loadCustomOperator(
        ctx: RequestContext,
        operatorCtx: OperatorContext,
    ): AdapterOperatorHelpers {
        const pathHelpers = this.buildPathHelpers();

        return {
            ctx: operatorCtx,
            secrets: this.createSecretResolver(ctx),
            get: pathHelpers.get,
            set: pathHelpers.set,
            remove: pathHelpers.remove,
            lookup: async (_entity, _by, _select) => undefined,
            format: this.buildFormatHelpers(),
            convert: this.buildConvertHelpers(),
            crypto: this.buildCryptoHelpers(),
        };
    }

    /**
     * Retry a function with configurable backoff.
     * Used for per-record retry in single-record operators.
     */
    private async executeWithRetry<T>(
        fn: () => Promise<T>,
        retryConfig: { maxRetries: number; retryDelayMs?: number; backoff?: 'FIXED' | 'EXPONENTIAL'; retryableErrors?: string[] },
    ): Promise<T> {
        for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === retryConfig.maxRetries) throw error;

                // Check if error is retryable
                if (retryConfig.retryableErrors?.length) {
                    const errorMsg = getErrorMessage(error);
                    const isRetryable = retryConfig.retryableErrors.some(pattern => errorMsg.includes(pattern));
                    if (!isRetryable) throw error;
                }

                const delay = retryConfig.retryDelayMs ?? 100;
                const waitMs = retryConfig.backoff === 'EXPONENTIAL'
                    ? delay * Math.pow(2, attempt)
                    : delay * (attempt + 1);
                await new Promise(r => setTimeout(r, waitMs));
            }
        }
        throw new Error('Unreachable: retry loop exited without returning or throwing');
    }

    /**
     * Execute operator in sandboxed environment with proper error handling.
     * Supports optional per-record retry for single-record operators.
     */
    private async executeInSandbox(
        operator: OperatorAdapter<unknown> | SingleRecordOperator<unknown>,
        input: RecordObject[],
        cfg: JsonObject,
        helpers: AdapterOperatorHelpers,
        retryConfig?: { maxRetries: number; retryDelayMs?: number; backoff?: 'FIXED' | 'EXPONENTIAL'; retryableErrors?: string[] },
    ): Promise<RecordObject[]> {
        // Check if it's a batch operator
        if ('apply' in operator && typeof (operator as OperatorAdapter<unknown>).apply === 'function') {
            const batchOperator = operator as OperatorAdapter<unknown>;
            const result = await batchOperator.apply(input as readonly JsonObject[], cfg, helpers);
            return result.records as RecordObject[];
        }

        // Check if it's a single-record operator
        if ('applyOne' in operator && typeof (operator as SingleRecordOperator<unknown>).applyOne === 'function') {
            const singleOperator = operator as SingleRecordOperator<unknown>;
            const results: RecordObject[] = [];
            for (const record of input) {
                const processFn = async () => singleOperator.applyOne(record as JsonObject, cfg, helpers);

                const result = retryConfig
                    ? await this.executeWithRetry(processFn, retryConfig)
                    : await processFn();

                if (result !== null) {
                    results.push(result as RecordObject);
                }
            }
            return results;
        }

        throw new Error(`Operator '${operator.code}' has no valid apply method`);
    }

    /**
     * Validate custom operator output and handle errors
     */
    private validateCustomOutput(
        error: unknown,
        operator: OperatorAdapter<unknown> | SingleRecordOperator<unknown>,
        stepKey: string,
    ): never {
        if (error instanceof OperatorNotFoundError) {
            throw error;
        }

        this.logger.error(`Operator execution failed`, error instanceof Error ? error : undefined, {
            adapterCode: operator.code,
            stepKey,
        });

        throw new Error(`Operator '${operator.code}' execution failed: ${getErrorMessage(error)}`);
    }

    /**
     * Execute an operator adapter from the registry
     */
    private async executeCustomOperator(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        operator: OperatorAdapter<unknown> | SingleRecordOperator<unknown>,
        pipelineContext?: PipelineContext,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;

        // Phase 1: Prepare context
        const operatorCtx = this.prepareCustomContext(ctx, step, pipelineContext);

        // Phase 2: Load operator helpers
        const helpers = this.loadCustomOperator(ctx, operatorCtx);

        // Phase 3: Resolve per-record retry config from step config
        const stepCfg = step.config as TransformStepConfig | undefined;
        const retryConfig = stepCfg?.retryPerRecord;

        // Phase 4: Execute in sandbox with error handling
        try {
            return await this.executeInSandbox(operator, input, cfg, helpers, retryConfig);
        } catch (error) {
            // Phase 5: Validate output / handle errors
            this.validateCustomOutput(error, operator, step.key);
        }
    }

    /**
     * Execute a validate step on the input records using inline field specifications.
     * Validation rules are defined directly in the step config, not from a database schema.
     * Supports both formats:
     * - fields: { fieldName: FieldSpec } - direct field specifications
     * - rules: [{ type, spec: { field, required, ... } }] - rule-based format from UI
     */
    async executeValidate(
        _ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const cfg = (step.config ?? {}) as {
            fields?: Record<string, unknown>;
            rules?: Array<{ type?: string; spec: Record<string, unknown> }>;
            errorHandlingMode?: string;
        };

        // Convert rules to fields format if rules are provided
        let fields: Record<string, import('../utils').FieldSpec> = {};

        if (cfg.rules && Array.isArray(cfg.rules)) {
            // Convert rules array to fields object
            for (const rule of cfg.rules) {
                const spec = rule.spec;
                if (!spec || typeof spec !== 'object') continue;

                const fieldName = spec.field as string;
                if (!fieldName) continue;

                if (!fields[fieldName]) {
                    fields[fieldName] = {};
                }

                // Map spec properties to FieldSpec
                if ('required' in spec) fields[fieldName].required = spec.required as boolean;
                if ('type' in spec) fields[fieldName].type = spec.type as string;
                if ('pattern' in spec) fields[fieldName].pattern = spec.pattern as string;
                if ('min' in spec) fields[fieldName].min = spec.min as number;
                if ('max' in spec) fields[fieldName].max = spec.max as number;
                if ('minLength' in spec) fields[fieldName].minLength = spec.minLength as number;
                if ('maxLength' in spec) fields[fieldName].maxLength = spec.maxLength as number;
                if ('enum' in spec) fields[fieldName].enum = spec.enum as JsonValue[];
            }
        } else if (cfg.fields) {
            // Use fields directly if provided
            fields = cfg.fields as Record<string, import('../utils').FieldSpec>;
        }

        const mode = (cfg.errorHandlingMode as string | undefined) ?? ValidationMode.FAIL_FAST;

        // If no fields defined, pass through all records
        if (Object.keys(fields).length === 0) return input;

        const out: RecordObject[] = [];

        for (const rec of input) {
            const errs = validateAgainstSimpleSpec(rec, fields);
            if (errs.length === 0) {
                out.push(rec);
            } else {
                if (onRecordError) await onRecordError(step.key, errs.join('; '), rec);
                if (mode === ValidationMode.FAIL_FAST) {
                    // drop this record
                } else {
                    // accumulate errors, still drop this record from the pipeline
                }
            }
        }
        return out;
    }

    /**
     * Execute an enrich step on the input records using built-in enrichment config.
     * Supports:
     * - defaults: Static default values to add to records
     * - computed: Computed field expressions (template syntax)
     * - sourceType: STATIC (inline defaults), HTTP (external API), VENDURE (entity lookup)
     * If adapterCode is provided, falls back to executeOperator for custom enrichers.
     */
    async executeEnrich(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        executorCtx?: ExecutorContext,
    ): Promise<RecordObject[]> {
        const cfg = (step.config ?? {}) as {
            adapterCode?: string;
            defaults?: Record<string, unknown>;
            computed?: Record<string, string>;
            sourceType?: 'STATIC' | 'HTTP' | 'VENDURE';
            set?: Record<string, unknown>;
        };

        // If adapterCode is provided, use the operator system
        if (cfg.adapterCode && executorCtx) {
            return this.executeOperator(ctx, step, input, executorCtx);
        }

        // Handle built-in enrichment based on sourceType or defaults
        const sourceType = cfg.sourceType || 'STATIC';

        if (sourceType === 'STATIC' || cfg.defaults || cfg.set) {
            // Apply static defaults/set values to each record
            const defaults = cfg.defaults || {};
            const setValues = cfg.set || {};
            const computed = cfg.computed || {};

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
                            return value !== null && value !== undefined ? String(value) : '';
                        });
                    }
                }

                return enriched;
            });
        }

        // For HTTP and VENDURE source types, would need async implementation
        // For now, pass through unchanged if no enrichment config is valid
        return input;
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
            if (out.length > 0) return out;
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

        return { __branchOutputs: true, branches: result };
    }
}
