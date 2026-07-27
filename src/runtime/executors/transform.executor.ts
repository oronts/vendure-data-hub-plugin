import * as crypto from 'crypto';
import { Injectable, Optional } from '@nestjs/common';
import { ID, RequestContext } from '@vendure/core';
import { JsonObject, JsonValue, PipelineStepDefinition, PipelineContext, VendureEntityType } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS, ValidationMode } from '../../constants/index';
import { RecordObject, OnRecordErrorCallback, ExecutorContext, BranchOutput, SANDBOX_PIPELINE_ID } from '../executor-types';
import {
    getPath,
    setPath,
    removePath,
    evalCondition,
    unitFactor,
    validateAgainstSimpleSpec,
} from '../utils';
import { DataHubRegistryService } from '../../sdk/registry.service';
import {
    AdapterOperatorHelpers,
    EnrichContext,
    EnricherAdapter,
    OperatorAdapter,
    OperatorContext,
    SingleRecordOperator,
    SdkValidationError,
    ValidateContext,
    ValidatorAdapter,
} from '../../sdk/types';
import { getOperatorRuntime, getCustomOperatorRuntime } from '../../operators/operator-runtime-registry';
import { OperatorSecretResolver } from '../../sdk/types/transform-types';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { SchemaRegistryService } from '../../services/schema/schema-registry.service';
import { formatSchemaValidationIssues } from '../../services/schema/schema-definition';
import { LoaderRegistryService } from '../../loaders/registry';
import {
    createConnectionsAdapter,
    createLoggerAdapter,
    createSecretsAdapter,
} from './context-adapters';
import { applyHttpLookupBatch } from '../../operators/enrichment/helpers';
import type { HttpLookupOperatorConfig } from '../../operators/enrichment/types';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { sleep, calculateSimpleBackoff } from '../../utils/retry.utils';
import { validateEnrichmentConfig } from '../../validation/enrichment-config.validator';
import {
    getAdapterCode,
    isTransformStepConfig,
    TransformStepConfig,
    OperatorConfig,
    BranchConfig,
} from '../../types/step-configs';

const OPERATOR_CHECKPOINTS_KEY = '__operatorCheckpoints';

function asJsonObject(value: JsonValue | undefined): JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonObject
        : {};
}

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

    constructor(
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
        @Optional() private secretService?: SecretService,
        @Optional() private loaderRegistry?: LoaderRegistryService,
        @Optional() private connectionService?: ConnectionService,
        @Optional() private schemaRegistry?: SchemaRegistryService,
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
        pipelineId?: ID,
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
            return await this.executeOperatorsArray(
                ctx,
                step,
                input,
                operatorsArray,
                executorCtx,
                pipelineContext,
                pipelineId,
            );
        }

        // Handle single operator format
        if (!adapterCode) {
            this.logger.warn(`No operator specified for transform step`, { stepKey: step.key });
            return input;
        }

        return await this.executeSingleOperator(
            ctx,
            step,
            input,
            adapterCode,
            cfg,
            executorCtx,
            pipelineContext,
            `single:${adapterCode}`,
            pipelineId,
        );
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
        operatorStateKey = `single:${adapterCode}`,
        pipelineId?: ID,
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
            executorCtx,
            operatorStateKey,
            pipelineContext,
            pipelineId,
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
        pipelineId?: ID,
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
                `array:${i}:${opCode}`,
                pipelineId,
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
        pipelineId?: ID,
    ): OperatorContext {
        return {
            ctx,
            pipelineId: pipelineId ?? SANDBOX_PIPELINE_ID,
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            logger: {
                info: (msg: string, meta?: JsonObject) => this.logger.info(msg, meta as Record<string, unknown> | undefined),
                warn: (msg: string, meta?: JsonObject) => this.logger.warn(msg, meta as Record<string, unknown> | undefined),
                error: (msg: string, errorOrMeta?: JsonObject | Error, meta?: JsonObject) => {
                    const error = toErrorOrUndefined(errorOrMeta);
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
                removePath(record, path);
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
            date: (date: Date | string | number, format?: string) => {
                const dateObj = new Date(date);
                if (!format || format === 'iso') return dateObj.toISOString();
                // Basic pattern substitution for common date formats
                return format
                    .replace('YYYY', String(dateObj.getUTCFullYear()))
                    .replace('MM', String(dateObj.getUTCMonth() + 1).padStart(2, '0'))
                    .replace('DD', String(dateObj.getUTCDate()).padStart(2, '0'))
                    .replace('HH', String(dateObj.getUTCHours()).padStart(2, '0'))
                    .replace('mm', String(dateObj.getUTCMinutes()).padStart(2, '0'))
                    .replace('ss', String(dateObj.getUTCSeconds()).padStart(2, '0'));
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
            parseDate: (value: string, format?: string) => {
                // If format is provided, try to parse structured date strings
                if (format && /^[YMDHms\-/.\s:]+$/.test(format)) {
                    const y = format.indexOf('YYYY'), m = format.indexOf('MM'), d = format.indexOf('DD');
                    if (y >= 0 && m >= 0 && d >= 0) {
                        const year = parseInt(value.substring(y, y + 4), 10);
                        const month = parseInt(value.substring(m, m + 2), 10) - 1;
                        const day = parseInt(value.substring(d, d + 2), 10);
                        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                            const parsed = new Date(Date.UTC(year, month, day));
                            return isNaN(parsed.getTime()) ? null : parsed;
                        }
                    }
                }
                const dateObj = new Date(value);
                return isNaN(dateObj.getTime()) ? null : dateObj;
            },
        };
    }

    /**
     * Build crypto utilities for operator helpers.
     *
     * `hash()` uses the specified algorithm (defaults to sha256).
     * `hmac()` uses Node.js crypto.createHmac for proper key-based HMAC.
     */
    private buildCryptoHelpers(): AdapterOperatorHelpers['crypto'] {
        return {
            hash: (value: string, algorithm?: 'sha256' | 'sha512') => {
                const algo = algorithm ?? 'sha256';
                if (algo !== 'sha256' && algo !== 'sha512') {
                    throw new Error(`Unsupported hash algorithm: ${String(algo)}`);
                }
                return crypto.createHash(algo).update(value).digest('hex');
            },
            hmac: (value: string, secret: string, algorithm?: 'sha256' | 'sha512') => {
                const algo = algorithm ?? 'sha256';
                return crypto.createHmac(algo, secret).update(value).digest('hex');
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
        executorCtx: ExecutorContext,
        operatorStateKey: string,
    ): AdapterOperatorHelpers {
        const pathHelpers = this.buildPathHelpers();
        const stepCheckpoint = executorCtx.cpData?.[operatorCtx.stepKey];
        const operatorCheckpoints = asJsonObject(stepCheckpoint?.[OPERATOR_CHECKPOINTS_KEY]);

        return {
            ctx: operatorCtx,
            secrets: this.createSecretResolver(ctx),
            ...(this.connectionService
                ? { connections: createConnectionsAdapter(this.connectionService, ctx) }
                : {}),
            checkpoint: asJsonObject(operatorCheckpoints[operatorStateKey]),
            setCheckpoint: checkpoint => {
                if (!executorCtx.cpData) return;
                const currentStepCheckpoint = executorCtx.cpData[operatorCtx.stepKey] ?? {};
                const currentOperatorCheckpoints = asJsonObject(
                    currentStepCheckpoint[OPERATOR_CHECKPOINTS_KEY],
                );
                executorCtx.cpData[operatorCtx.stepKey] = {
                    ...currentStepCheckpoint,
                    [OPERATOR_CHECKPOINTS_KEY]: {
                        ...currentOperatorCheckpoints,
                        [operatorStateKey]: checkpoint,
                    },
                };
                executorCtx.markCheckpointDirty();
            },
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
                    ? calculateSimpleBackoff(attempt, delay)
                    : delay;
                await sleep(waitMs);
            }
        }
        // istanbul ignore next -- required for TypeScript exhaustiveness (loop always returns or throws)
        throw new Error('Unreachable');
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
            if (result.errors && result.errors.length > 0) {
                const firstError = result.errors[0];
                if (cfg.failOnError === true) {
                    throw new Error(
                        `${result.errors.length} operator record(s) failed: ${firstError.message}`,
                    );
                }
                this.logger.warn('Operator completed with recoverable record errors', {
                    operatorCode: operator.code,
                    errorCount: result.errors.length,
                    firstError: firstError.message,
                    firstErrorField: firstError.field,
                });
            }
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

        this.logger.error(`Operator execution failed`, toErrorOrUndefined(error), {
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
        executorCtx: ExecutorContext,
        operatorStateKey: string,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;

        const operatorCtx = this.prepareCustomContext(
            ctx,
            step,
            pipelineContext,
            pipelineId,
        );

        const helpers = this.loadCustomOperator(ctx, operatorCtx, executorCtx, operatorStateKey);

        const stepCfg = step.config as TransformStepConfig | undefined;
        const retryConfig = stepCfg?.retryPerRecord;

        try {
            return await this.executeInSandbox(operator, input, cfg, helpers, retryConfig);
        } catch (error) {
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
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const cfg = (step.config ?? {}) as {
            fields?: Record<string, unknown>;
            rules?: Array<{ type?: string; spec: Record<string, unknown> }>;
            errorHandlingMode?: string;
        };

        const mode = (cfg.errorHandlingMode as string | undefined) ?? ValidationMode.FAIL_FAST;
        const adapterCode = getAdapterCode(step);
        if (adapterCode) {
            return this.executeCustomValidator(
                ctx,
                step,
                input,
                adapterCode,
                mode === ValidationMode.ACCUMULATE ? 'ACCUMULATE' : 'FAIL_FAST',
                onRecordError,
                pipelineContext,
                pipelineId,
            );
        }

        let validatedInput = input;
        if (step.schemaRef) {
            if (!this.schemaRegistry) {
                throw new Error('Schema registry is unavailable for validate step');
            }
            const validation = await this.schemaRegistry.validateRecords(
                ctx,
                step.schemaRef,
                input,
            );
            const invalid = validation.records.filter(item => item.issues.length > 0);
            if (validation.schema.compatibility === 'PERMISSIVE') {
                if (invalid.length > 0) {
                    this.logger.warn('Permissive schema validation accepted mismatched records', {
                        stepKey: step.key,
                        schemaId: validation.schema.schemaId,
                        schemaVersion: validation.schema.version,
                        recordCount: invalid.length,
                    });
                }
            } else {
                validatedInput = [];
                for (const item of validation.records) {
                    if (item.issues.length === 0) {
                        validatedInput.push(item.record);
                        continue;
                    }
                    const message = `Schema ${validation.schema.schemaId}@${validation.schema.version}: ${formatSchemaValidationIssues(item.issues)}`;
                    if (onRecordError) await onRecordError(step.key, message, item.record);
                    if (mode === ValidationMode.FAIL_FAST) return [];
                }
            }
        }

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
                if ('error' in spec) fields[fieldName].error = spec.error as string;
            }
        } else if (cfg.fields) {
            // Use fields directly if provided
            fields = cfg.fields as Record<string, import('../utils').FieldSpec>;
        }

        // If no fields defined, pass through all records
        if (Object.keys(fields).length === 0) return validatedInput;

        const out: RecordObject[] = [];

        for (const rec of validatedInput) {
            const errs = validateAgainstSimpleSpec(rec, fields);
            if (errs.length === 0) {
                out.push(rec);
            } else {
                if (onRecordError) await onRecordError(step.key, errs.join('; '), rec);
                // In FAIL_FAST mode, stop after the first validation error
                if (mode === ValidationMode.FAIL_FAST) return [];
            }
        }
        return out;
    }

    private async executeCustomValidator(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        adapterCode: string,
        mode: ValidateContext['mode'],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const adapter = this.registry?.getRuntime('VALIDATOR', adapterCode) as
            | ValidatorAdapter<unknown>
            | undefined;
        if (!adapter || typeof adapter.validate !== 'function') {
            throw new Error(`Validator adapter '${adapterCode}' is not registered for runtime execution`);
        }

        const context: ValidateContext = {
            ctx,
            pipelineId: pipelineId ?? SANDBOX_PIPELINE_ID,
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            mode,
            logger: createLoggerAdapter(this.logger),
        };

        const result = await adapter.validate(
            context,
            step.config ?? {},
            input,
        );
        if (!Array.isArray(result.valid) || !Array.isArray(result.invalid)) {
            throw new Error(`Validator adapter '${adapterCode}' returned an invalid result`);
        }

        const invalid = mode === 'FAIL_FAST'
            ? result.invalid.slice(0, 1)
            : result.invalid;
        for (const item of invalid) {
            const message = item.errors.length > 0
                ? item.errors.map((error: SdkValidationError) => error.message).join('; ')
                : `Validator '${adapterCode}' rejected the record`;
            if (onRecordError) {
                await onRecordError(step.key, message, item.record);
            }
        }

        return mode === 'FAIL_FAST' && result.invalid.length > 0
            ? []
            : result.valid as RecordObject[];
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

        const secretResolver = this.createSecretResolver(ctx);

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
