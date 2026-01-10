import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonObject, PipelineStepDefinition, PipelineContext } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { RecordObject, OnRecordErrorCallback, ExecutorContext, BranchOutput } from '../executor-types';
import {
    getPath,
    setPath,
    evalCondition,
    unitFactor,
    validateAgainstSimpleSpec,
    deepClone,
} from '../utils';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { OperatorAdapter, SingleRecordOperator, OperatorHelpers, OperatorContext } from '../../sdk/types';
import { hashStable } from '../utils';

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
        const adapterCode = (cfg as any)?.adapterCode as string | undefined;
        const operatorsArray = (cfg as any)?.operators as Array<{ op: string; args?: Record<string, unknown> }> | undefined;

        this.logger.debug(`Executing transform step`, {
            stepKey: step.key,
            adapterCode,
            operatorCount: operatorsArray?.length,
            recordCount: input.length,
        });

        // Handle multi-operator array format
        if (operatorsArray && Array.isArray(operatorsArray) && operatorsArray.length > 0) {
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
        // Look up operator in registry
        if (!this.registry) {
            throw new Error('DataHubRegistryService is not available. Cannot execute operators.');
        }

        const operator = this.registry.getRuntime('operator', adapterCode);
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
            operator as OperatorAdapter<any> | SingleRecordOperator<any>,
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
        operators: Array<{ op: string; args?: Record<string, unknown> }>,
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

            // Create a synthetic step config for this single operator
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
     * Execute an operator adapter from the registry
     */
    private async executeCustomOperator(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        operator: OperatorAdapter<any> | SingleRecordOperator<any>,
        pipelineContext?: PipelineContext,
    ): Promise<RecordObject[]> {
        const cfg = step.config as JsonObject;

        // Create operator context and helpers
        const operatorCtx: OperatorContext = {
            ctx,
            pipelineId: '0',
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            logger: {
                info: (msg: string, meta?: any) => this.logger.info(msg, meta),
                warn: (msg: string, meta?: any) => this.logger.warn(msg, meta),
                error: (msg: string, meta?: any) => this.logger.error(msg, undefined, meta),
                debug: (msg: string, meta?: any) => this.logger.debug(msg, meta),
            },
        };

        const helpers: OperatorHelpers = {
            ctx: operatorCtx,
            get: (record: JsonObject, path: string) => getPath(record as RecordObject, path),
            set: (record: JsonObject, path: string, value: any) => setPath(record as RecordObject, path, value),
            remove: (record: JsonObject, path: string) => {
                const parts = path.split('.');
                let cur: any = record;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (cur == null) return;
                    cur = cur[parts[i]];
                }
                if (cur) delete cur[parts[parts.length - 1]];
            },
            lookup: async (entity, by, select) => undefined, // Would need full implementation
            format: {
                currency: (amount: number, currencyCode: string, locale?: string) => {
                    return new Intl.NumberFormat(locale ?? 'en-US', { style: 'currency', currency: currencyCode }).format(amount);
                },
                date: (date: Date | string | number, format: string) => {
                    const d = new Date(date);
                    return d.toISOString();
                },
                number: (value: number, decimals?: number, locale?: string) => {
                    return new Intl.NumberFormat(locale ?? 'en-US', { maximumFractionDigits: decimals ?? 2 }).format(value);
                },
                template: (template: string, data: JsonObject) => {
                    return template.replace(/\{\{([^}]+)\}\}/g, (_m, p1) => {
                        const v = getPath(data as RecordObject, String(p1).trim());
                        return v == null ? '' : String(v);
                    });
                },
            },
            convert: {
                toMinorUnits: (amount: number, decimals = 2) => Math.round(amount * Math.pow(10, decimals)),
                fromMinorUnits: (amount: number, decimals = 2) => amount / Math.pow(10, decimals),
                unit: (value: number, from: any, to: any) => unitFactor(from, to) * value,
                parseDate: (value: string, format?: string) => {
                    const d = new Date(value);
                    return isNaN(d.getTime()) ? null : d;
                },
            },
            crypto: {
                hash: (value: string, algorithm?: 'md5' | 'sha256' | 'sha512') => hashStable(value),
                hmac: (value: string, secret: string, algorithm?: 'sha256' | 'sha512') => {
                    return hashStable(value + secret);
                },
                uuid: () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36)}`,
            },
        };

        try {
            // Check if it's a batch operator
            if ('apply' in operator && typeof (operator as OperatorAdapter<any>).apply === 'function') {
                const batchOperator = operator as OperatorAdapter<any>;
                const result = await batchOperator.apply(input as readonly JsonObject[], cfg, helpers);
                return result.records as RecordObject[];
            }

            // Check if it's a single-record operator
            if ('applyOne' in operator && typeof (operator as SingleRecordOperator<any>).applyOne === 'function') {
                const singleOperator = operator as SingleRecordOperator<any>;
                const results: RecordObject[] = [];
                for (const record of input) {
                    const result = await singleOperator.applyOne(record as JsonObject, cfg, helpers);
                    if (result !== null) {
                        results.push(result as RecordObject);
                    }
                }
                return results;
            }

            // Should not reach here due to earlier check
            throw new Error(`Operator '${operator.code}' has no valid apply method`);
        } catch (error) {
            // Re-throw OperatorNotFoundError as is
            if (error instanceof OperatorNotFoundError) {
                throw error;
            }

            this.logger.error(`Operator execution failed`, error instanceof Error ? error : undefined, {
                adapterCode: operator.code,
                stepKey: step.key,
            });

            // Re-throw the error - don't silently pass through
            throw new Error(`Operator '${operator.code}' execution failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Execute a validate step on the input records using inline field specifications.
     * Validation rules are defined directly in the step config, not from a database schema.
     */
    async executeValidate(
        _ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const cfg: any = step.config ?? {};
        const fields: Record<string, any> = cfg.fields ?? {};
        const mode = (cfg.mode as string | undefined) ?? 'fail-fast';

        // If no fields defined, pass through all records
        if (Object.keys(fields).length === 0) return input;

        const out: RecordObject[] = [];

        for (const rec of input) {
            const errs = validateAgainstSimpleSpec(rec, fields);
            if (errs.length === 0) {
                out.push(rec);
            } else {
                if (onRecordError) await onRecordError(step.key, errs.join('; '), rec);
                if (mode === 'fail-fast') {
                    // drop this record
                } else {
                    // accumulate errors, still drop this record from the pipeline
                }
            }
        }
        return out;
    }

    /**
     * Execute a route step on the input records (returns first matching branch for linear pipelines)
     */
    async executeRoute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordObject[]> {
        const cfg: any = step.config ?? {};
        const branches: Array<{ name: string; when: Array<{ field: string; cmp: string; value: any }> }> = cfg.branches ?? [];
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
        const cfg: any = step.config ?? {};
        const branchesCfg: Array<{ name: string; when: Array<{ field: string; cmp: string; value: any }> }> = cfg.branches ?? [];
        const result: Record<string, RecordObject[]> = {};
        const matchedSet = new Set<number>();

        for (const b of branchesCfg) {
            const matched = input.filter((rec, idx) => {
                const m = (b.when ?? []).every(cond => evalCondition(rec, cond));
                if (m) matchedSet.add(idx);
                return m;
            });
            result[b.name] = matched;
        }

        const defaultRecs = input.filter((_rec, idx) => !matchedSet.has(idx));
        result['default'] = defaultRecs;

        return { __branchOutputs: true, branches: result };
    }
}
