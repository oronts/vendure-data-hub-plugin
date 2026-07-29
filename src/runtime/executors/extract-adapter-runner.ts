import type { ID, RequestContext } from '@vendure/core';
import type { ConnectionService } from '../../services/config/connection.service';
import type { SecretService } from '../../services/config/secret.service';
import type { DataHubLogger } from '../../services/logger';
import type {
    BatchExtractorAdapter,
    ExtractorAdapter,
} from '../../sdk/types';
import type {
    BatchDataExtractor,
    DataExtractor,
    ExtractorPreviewResult,
    ExtractorValidationResult,
    JsonObject,
    PipelineStepDefinition,
} from '../../types';
import type {
    ExecutorContext,
    OnRecordErrorCallback,
    RecordObject,
} from '../executor-types';
import {
    createInternalExtractorContext,
    createSdkExtractorContext,
    hasReachedRecordLimit,
    materializeRecord,
    materializeRecords,
} from './extract-execution-context';
import { normalizeExtractPreview } from './extract-schema-validation';

type ExtractorFailureHandler = (
    error: unknown,
    adapterCode: string,
    stepKey: string,
    onRecordError?: OnRecordErrorCallback,
) => Promise<never>;

interface ExtractorAdapterRunnerOptions {
    readonly secretService: SecretService;
    readonly connectionService: ConnectionService;
    readonly logger: DataHubLogger;
    readonly handleFailure: ExtractorFailureHandler;
}

interface RegisteredExecutionOptions {
    readonly ctx: RequestContext;
    readonly step: PipelineStepDefinition;
    readonly executorCtx: ExecutorContext;
    readonly onRecordError?: OnRecordErrorCallback;
    readonly pipelineId?: ID;
    readonly runId?: ID;
    readonly sourceRecords?: readonly JsonObject[];
}

type SdkExecutionOptions = RegisteredExecutionOptions;

export function assertValidExtractorConfig(
    adapterCode: string,
    validation: ExtractorValidationResult,
    logger: DataHubLogger,
): void {
    if (validation.warnings?.length) {
        logger.warn('Extractor configuration validation warnings', {
            adapterCode,
            warnings: validation.warnings,
        });
    }
    if (validation.valid) {
        return;
    }

    const errors = validation.errors
        .map(error => `${error.field}: ${error.message}`)
        .join('; ');
    throw new Error(
        `Invalid configuration for extractor "${adapterCode}": ${errors || 'unknown validation error'}`,
    );
}

export class ExtractorAdapterRunner {
    constructor(private readonly options: ExtractorAdapterRunnerOptions) {}

    async executeSdkStreaming(
        extractor: ExtractorAdapter<unknown>,
        options: SdkExecutionOptions,
    ): Promise<RecordObject[]> {
        const context = this.createSdkContext(options);
        const config = options.step.config as JsonObject;
        const records: RecordObject[] = [];

        try {
            if (options.executorCtx.recordLimit !== undefined && extractor.preview) {
                return this.materializePreview(
                    await extractor.preview(
                        context,
                        config,
                        options.executorCtx.recordLimit,
                    ),
                    options.executorCtx,
                );
            }
            for await (const envelope of extractor.extract(context, config)) {
                records.push(materializeRecord(envelope.data));
                if (hasReachedRecordLimit(records.length, options.executorCtx)) {
                    break;
                }
            }
            return records;
        } catch (error) {
            return this.handleFailure(error, extractor.code, options);
        }
    }

    async executeSdkBatch(
        extractor: BatchExtractorAdapter<unknown>,
        options: SdkExecutionOptions,
    ): Promise<RecordObject[]> {
        const context = this.createSdkContext(options);
        const config = options.step.config as JsonObject;

        try {
            if (options.executorCtx.recordLimit !== undefined) {
                return this.materializePreview(
                    await extractor.preview(
                        context,
                        config,
                        options.executorCtx.recordLimit,
                    ),
                    options.executorCtx,
                );
            }
            const result = await extractor.extractAll(context, config);
            return materializeRecords(
                result.records.map(envelope => envelope.data),
                options.executorCtx,
            );
        } catch (error) {
            return this.handleFailure(error, extractor.code, options);
        }
    }

    async executeRegisteredStreaming(
        extractor: DataExtractor,
        options: RegisteredExecutionOptions,
    ): Promise<RecordObject[]> {
        const context = this.createRegisteredContext(options);
        const config = options.step.config as JsonObject;
        const records: RecordObject[] = [];

        try {
            const validation = await extractor.validate(context, config);
            assertValidExtractorConfig(extractor.code, validation, this.options.logger);
            if (options.executorCtx.recordLimit !== undefined && extractor.preview) {
                return this.materializePreview(
                    await extractor.preview(
                        context,
                        config,
                        options.executorCtx.recordLimit,
                    ),
                    options.executorCtx,
                );
            }
            for await (const envelope of extractor.extract(context, config)) {
                records.push(materializeRecord(envelope.data));
                if (hasReachedRecordLimit(records.length, options.executorCtx)) {
                    break;
                }
            }
            return records;
        } catch (error) {
            return this.handleFailure(error, extractor.code, options);
        }
    }

    async executeRegisteredBatch(
        extractor: BatchDataExtractor,
        options: RegisteredExecutionOptions,
    ): Promise<RecordObject[]> {
        const context = this.createRegisteredContext(options);
        const config = options.step.config as JsonObject;

        try {
            const validation = await extractor.validate(context, config);
            assertValidExtractorConfig(extractor.code, validation, this.options.logger);
            if (options.executorCtx.recordLimit !== undefined) {
                return this.materializePreview(
                    await extractor.preview(
                        context,
                        config,
                        options.executorCtx.recordLimit,
                    ),
                    options.executorCtx,
                );
            }
            const result = await extractor.extractAll(context, config);
            return materializeRecords(
                result.records.map(envelope => envelope.data),
                options.executorCtx,
            );
        } catch (error) {
            return this.handleFailure(error, extractor.code, options);
        }
    }

    private createSdkContext(options: SdkExecutionOptions) {
        return createSdkExtractorContext({
            ...options,
            secretService: this.options.secretService,
            connectionService: this.options.connectionService,
            logger: this.options.logger,
        });
    }

    private createRegisteredContext(options: RegisteredExecutionOptions) {
        return createInternalExtractorContext({
            ...options,
            secretService: this.options.secretService,
            connectionService: this.options.connectionService,
            logger: this.options.logger,
        });
    }

    private materializePreview(
        result: ExtractorPreviewResult,
        executorCtx: ExecutorContext,
    ): RecordObject[] {
        const limit = executorCtx.recordLimit ?? result.records.length;
        const preview = normalizeExtractPreview(result, limit);
        return materializeRecords(
            preview.records.map(envelope => envelope.data),
            executorCtx,
        );
    }

    private handleFailure(
        error: unknown,
        adapterCode: string,
        options: Pick<SdkExecutionOptions, 'step' | 'onRecordError'>,
    ): Promise<never> {
        return this.options.handleFailure(
            error,
            adapterCode,
            options.step.key,
            options.onRecordError,
        );
    }
}
