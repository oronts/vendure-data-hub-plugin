import type { ID, RequestContext } from '@vendure/core';
import type { ConnectionService } from '../../services/config/connection.service';
import type { SecretService } from '../../services/config/secret.service';
import type { DataHubLogger } from '../../services/logger';
import { DataHubRegistryService } from '../../sdk/registry.service';
import type {
    AdapterOperatorHelpers,
    OperatorAdapter,
    OperatorContext,
    SingleRecordOperator,
} from '../../sdk/types';
import type {
    JsonObject,
    PipelineContext,
    PipelineStepDefinition,
} from '../../types';
import {
    getAdapterCode,
    isTransformStepConfig,
    type OperatorConfig,
    type TransformStepConfig,
} from '../../types/step-configs';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { calculateSimpleBackoff, sleep } from '../../utils/retry.utils';
import {
    getCustomOperatorRuntime,
    getOperatorRuntime,
} from '../../operators/operator-runtime-registry';
import type { ExecutorContext, RecordObject } from '../executor-types';
import { SANDBOX_PIPELINE_ID } from '../executor-types';
import { createOperatorHelpers } from './transform-operator-helpers';

type OperatorRuntime = OperatorAdapter<unknown> | SingleRecordOperator<unknown>;
type OperatorRetryConfig = NonNullable<TransformStepConfig['retryPerRecord']>;

export class OperatorNotFoundError extends Error {
    constructor(
        public readonly operatorCode: string,
        public readonly stepKey: string,
    ) {
        super(
            `Operator '${operatorCode}' not found in registry. Step: ${stepKey}. ` +
            'Ensure the operator is properly registered. Available operators can be queried via the DataHub API.',
        );
        this.name = 'OperatorNotFoundError';
    }
}

export class TransformOperatorRunner {
    constructor(
        private readonly logger: DataHubLogger,
        private readonly registry?: DataHubRegistryService,
        private readonly secretService?: SecretService,
        private readonly connectionService?: ConnectionService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        executorCtx: ExecutorContext,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const config = step.config as JsonObject;
        const adapterCode = getAdapterCode(step);
        const operators = isTransformStepConfig(config)
            ? (config as TransformStepConfig).operators
            : undefined;

        this.logger.debug('Executing transform step', {
            stepKey: step.key,
            adapterCode: adapterCode || undefined,
            operatorCount: operators?.length,
            recordCount: input.length,
        });

        if (operators && operators.length > 0) {
            return this.executeOperators(
                ctx,
                step,
                input,
                operators,
                executorCtx,
                pipelineContext,
                pipelineId,
            );
        }

        if (!adapterCode) {
            this.logger.warn('No operator specified for transform step', {
                stepKey: step.key,
            });
            return input;
        }

        return this.executeSingleOperator(
            ctx,
            step,
            input,
            adapterCode,
            executorCtx,
            `single:${adapterCode}`,
            pipelineContext,
            pipelineId,
        );
    }

    private async executeOperators(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        operators: OperatorConfig[],
        executorCtx: ExecutorContext,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        let records = input;

        for (const [index, operatorConfig] of operators.entries()) {
            const operatorCode = operatorConfig.op;
            const config = {
                adapterCode: operatorCode,
                ...(operatorConfig.args ?? {}),
            } as JsonObject;

            this.logger.debug(
                `Executing operator ${index + 1}/${operators.length}`,
                {
                    stepKey: step.key,
                    op: operatorCode,
                    recordCount: records.length,
                },
            );

            records = await this.executeSingleOperator(
                ctx,
                { ...step, config },
                records,
                operatorCode,
                executorCtx,
                `array:${index}:${operatorCode}`,
                pipelineContext,
                pipelineId,
            );
        }

        return records;
    }

    private async executeSingleOperator(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        adapterCode: string,
        executorCtx: ExecutorContext,
        operatorStateKey: string,
        pipelineContext?: PipelineContext,
        pipelineId?: ID,
    ): Promise<RecordObject[]> {
        const operator = this.resolveOperator(adapterCode, step.key);
        const operatorContext = this.createOperatorContext(
            ctx,
            step,
            pipelineContext,
            pipelineId,
        );
        const helpers = createOperatorHelpers({
            ctx,
            operatorContext,
            executorContext: executorCtx,
            operatorStateKey,
            secretService: this.secretService,
            connectionService: this.connectionService,
        });
        const retryConfig = (step.config as TransformStepConfig | undefined)
            ?.retryPerRecord;

        try {
            return await this.executeOperator(
                operator,
                input,
                step.config as JsonObject,
                helpers,
                retryConfig,
            );
        } catch (error) {
            if (error instanceof OperatorNotFoundError) throw error;

            this.logger.error(
                'Operator execution failed',
                toErrorOrUndefined(error),
                {
                    adapterCode: operator.code,
                    stepKey: step.key,
                },
            );
            throw new Error(
                `Operator '${operator.code}' execution failed: ${getErrorMessage(error)}`,
            );
        }
    }

    private resolveOperator(adapterCode: string, stepKey: string): OperatorRuntime {
        const operator = getOperatorRuntime(adapterCode)
            ?? getCustomOperatorRuntime(this.registry, adapterCode);
        if (!operator) {
            throw new OperatorNotFoundError(adapterCode, stepKey);
        }
        if (!('apply' in operator || 'applyOne' in operator)) {
            throw new Error(
                `Adapter '${adapterCode}' is not an operator ` +
                `(missing apply/applyOne method). Step: ${stepKey}`,
            );
        }
        return operator as OperatorRuntime;
    }

    private createOperatorContext(
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
                info: (message, meta) => {
                    this.logger.info(
                        message,
                        meta as Record<string, unknown> | undefined,
                    );
                },
                warn: (message, meta) => {
                    this.logger.warn(
                        message,
                        meta as Record<string, unknown> | undefined,
                    );
                },
                error: (message, errorOrMeta, meta) => {
                    const error = toErrorOrUndefined(errorOrMeta);
                    const metadata = errorOrMeta instanceof Error
                        ? meta
                        : errorOrMeta;
                    this.logger.error(
                        message,
                        error,
                        metadata as Record<string, unknown> | undefined,
                    );
                },
                debug: (message, meta) => {
                    this.logger.debug(
                        message,
                        meta as Record<string, unknown> | undefined,
                    );
                },
            },
        };
    }

    private async executeOperator(
        operator: OperatorRuntime,
        input: RecordObject[],
        config: JsonObject,
        helpers: AdapterOperatorHelpers,
        retryConfig?: OperatorRetryConfig,
    ): Promise<RecordObject[]> {
        if ('apply' in operator && typeof operator.apply === 'function') {
            const result = await operator.apply(
                input as readonly JsonObject[],
                config,
                helpers,
            );
            if (result.errors && result.errors.length > 0) {
                const firstError = result.errors[0];
                if (config.failOnError === true) {
                    throw new Error(
                        `${result.errors.length} operator record(s) failed: ` +
                        firstError.message,
                    );
                }
                this.logger.warn(
                    'Operator completed with recoverable record errors',
                    {
                        operatorCode: operator.code,
                        errorCount: result.errors.length,
                        firstError: firstError.message,
                        firstErrorField: firstError.field,
                    },
                );
            }
            return result.records as RecordObject[];
        }

        if ('applyOne' in operator && typeof operator.applyOne === 'function') {
            const records: RecordObject[] = [];
            for (const record of input) {
                const apply = async () => operator.applyOne(
                    record as JsonObject,
                    config,
                    helpers,
                );
                const result = retryConfig
                    ? await this.executeWithRetry(apply, retryConfig)
                    : await apply();
                if (result !== null) records.push(result as RecordObject);
            }
            return records;
        }

        throw new Error(
            `Operator '${operator.code}' has no valid apply method`,
        );
    }

    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        retryConfig: OperatorRetryConfig,
    ): Promise<T> {
        for (
            let attempt = 0;
            attempt <= retryConfig.maxRetries;
            attempt++
        ) {
            try {
                return await operation();
            } catch (error) {
                if (attempt === retryConfig.maxRetries) throw error;

                if (retryConfig.retryableErrors?.length) {
                    const message = getErrorMessage(error);
                    const retryable = retryConfig.retryableErrors.some(
                        pattern => message.includes(pattern),
                    );
                    if (!retryable) throw error;
                }

                const delay = retryConfig.retryDelayMs ?? 100;
                const wait = retryConfig.backoff === 'EXPONENTIAL'
                    ? calculateSimpleBackoff(attempt, delay)
                    : delay;
                await sleep(wait);
            }
        }

        throw new Error('Operator retry loop completed without a result');
    }
}
