/**
 * Centralized database logging with configurable persistence levels.
 * Respects LogPersistenceLevel to control what gets persisted while
 * always maintaining full console logging.
 */

import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { LogPersistenceLevel } from '../../constants/enums';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { PipelineLogService } from '../pipeline/pipeline-log.service';
import { DataHubSettingsService } from '../config/settings.service';
import { DataHubLogger, DataHubLoggerFactory } from './datahub-logger';
import { ExecutionLogDetailWriter } from './execution-log-detail-writer';
import { ExecutionLogPersistencePolicy } from './execution-log-persistence-policy';
import type {
    LogEventOptions,
    LogEventType,
    StepExecutionInfo,
} from './execution-logger.types';
import {
    sanitizeExecutionLogMessage,
    sanitizeExecutionLogObject,
} from './execution-log-safety';

export type { LogEventType } from './execution-logger.types';

@Injectable()
export class ExecutionLogger {
    private readonly consoleLogger: DataHubLogger;
    private readonly detailWriter: ExecutionLogDetailWriter;
    private readonly persistencePolicy: ExecutionLogPersistencePolicy;

    constructor(
        private readonly pipelineLogService: PipelineLogService,
        settingsService: DataHubSettingsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.consoleLogger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXECUTION_LOGGER);
        this.persistencePolicy = new ExecutionLogPersistencePolicy(settingsService);
        this.detailWriter = new ExecutionLogDetailWriter(
            pipelineLogService,
            this.consoleLogger,
            this.persistencePolicy,
        );
    }

    private async persist(
        eventType: LogEventType,
        write: (level: LogPersistenceLevel) => Promise<void>,
    ): Promise<void> {
        await this.persistencePolicy.persist(eventType, write, error => {
            this.consoleLogger.warn('Execution log persistence failed', {
                eventType,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }

    async logPipelineStart(
        ctx: RequestContext,
        pipelineCode: string,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Pipeline "${pipelineCode}" execution started`;

        this.consoleLogger.info(message, { pipelineCode, ...options.context });

        await this.persist('pipeline.start', async () => {
            await this.pipelineLogService.info(ctx, sanitizeExecutionLogMessage(message), {
                pipelineId: options.pipelineId,
                runId: options.runId,
                context: sanitizeExecutionLogObject({ pipelineCode, ...options.context }),
            });
        });
    }

    async logPipelineComplete(
        ctx: RequestContext,
        pipelineCode: string,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Pipeline "${pipelineCode}" execution completed`;

        this.consoleLogger.info(message, {
            pipelineCode,
            durationMs: options.durationMs,
            recordsProcessed: options.recordsProcessed,
            recordsFailed: options.recordsFailed,
            ...options.context,
        });

        await this.persist('pipeline.complete', async () => {
            await this.pipelineLogService.info(ctx, sanitizeExecutionLogMessage(message), {
                pipelineId: options.pipelineId,
                runId: options.runId,
                durationMs: options.durationMs,
                recordsProcessed: options.recordsProcessed,
                recordsFailed: options.recordsFailed,
                context: sanitizeExecutionLogObject({ pipelineCode, ...options.context }),
                metadata: sanitizeExecutionLogObject(options.metadata),
            });
        });
    }

    async logPipelineFailed(
        ctx: RequestContext,
        pipelineCode: string,
        error: Error,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Pipeline "${pipelineCode}" execution failed: ${error.message}`;

        this.consoleLogger.error(message, error, {
            pipelineCode,
            durationMs: options.durationMs,
            ...options.context,
        });

        await this.persist('pipeline.fail', async () => {
            await this.pipelineLogService.error(ctx, sanitizeExecutionLogMessage(message), {
                pipelineId: options.pipelineId,
                runId: options.runId,
                durationMs: options.durationMs,
                context: sanitizeExecutionLogObject({
                    pipelineCode,
                    error: error.message,
                    ...options.context,
                }),
                metadata: sanitizeExecutionLogObject({
                    stack: error.stack ?? null,
                    ...options.metadata,
                }),
            });
        });
    }

    async logStepStart(
        ctx: RequestContext,
        stepKey: string,
        stepType: string,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Step "${stepKey}" (${stepType}) started`;

        this.consoleLogger.debug(message, { stepKey, stepType, ...options.context });

        await this.persist('step.start', async () => {
            await this.pipelineLogService.info(ctx, sanitizeExecutionLogMessage(message), {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                context: sanitizeExecutionLogObject({ stepType, ...options.context }),
            });
        });
    }

    async logStepComplete(
        ctx: RequestContext,
        stepKey: string,
        stepType: string,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Step "${stepKey}" (${stepType}) completed`;

        this.consoleLogger.debug(message, {
            stepKey,
            stepType,
            durationMs: options.durationMs,
            recordsProcessed: options.recordsProcessed,
            recordsFailed: options.recordsFailed,
            ...options.context,
        });

        await this.persist('step.complete', async () => {
            await this.pipelineLogService.info(ctx, sanitizeExecutionLogMessage(message), {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                durationMs: options.durationMs,
                recordsProcessed: options.recordsProcessed,
                recordsFailed: options.recordsFailed,
                context: sanitizeExecutionLogObject({ stepType, ...options.context }),
                metadata: sanitizeExecutionLogObject(options.metadata),
            });
        });
    }

    async logStepFailed(
        ctx: RequestContext,
        stepKey: string,
        stepType: string,
        error: Error,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Step "${stepKey}" (${stepType}) failed: ${error.message}`;

        this.consoleLogger.error(message, error, {
            stepKey,
            stepType,
            durationMs: options.durationMs,
            ...options.context,
        });

        await this.persist('step.fail', async () => {
            await this.pipelineLogService.error(ctx, sanitizeExecutionLogMessage(message), {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                durationMs: options.durationMs,
                context: sanitizeExecutionLogObject({
                    stepType,
                    error: error.message,
                    ...options.context,
                }),
                metadata: sanitizeExecutionLogObject({
                    stack: error.stack ?? null,
                    ...options.metadata,
                }),
            });
        });
    }

    async logRecordError(
        ctx: RequestContext,
        stepKey: string,
        errorMessage: string,
        payload: Record<string, unknown>,
        options: LogEventOptions,
        stackTrace?: string,
    ): Promise<void> {
        const message = `Record error in step "${stepKey}": ${errorMessage}`;

        this.consoleLogger.warn(message, {
            stepKey,
            error: errorMessage,
            ...(stackTrace ? { stack: stackTrace } : {}),
            ...options.context,
        });

        await this.persist('record.error', async () => {
            await this.pipelineLogService.warn(ctx, sanitizeExecutionLogMessage(message), {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                context: sanitizeExecutionLogObject({ error: errorMessage, ...options.context }),
                metadata: sanitizeExecutionLogObject({
                    ...payload,
                    ...(stackTrace ? { stack: stackTrace } : {}),
                }),
            });
        });
    }

    async logDebug(
        ctx: RequestContext,
        message: string,
        options: LogEventOptions,
    ): Promise<void> {
        this.consoleLogger.debug(message, options.context);

        await this.persist('debug', async () => {
            await this.pipelineLogService.debug(ctx, sanitizeExecutionLogMessage(message), {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey: options.stepKey,
                context: sanitizeExecutionLogObject(options.context),
                metadata: sanitizeExecutionLogObject(options.metadata),
            });
        });
    }

    async logStepExecution(
        ctx: RequestContext,
        info: StepExecutionInfo,
        options: LogEventOptions,
    ): Promise<void> {
        await this.detailWriter.logStepExecution(ctx, info, options);
    }

    async logExtractedData(
        ctx: RequestContext,
        stepKey: string,
        adapterCode: string,
        records: Record<string, unknown>[],
        options: LogEventOptions,
    ): Promise<void> {
        await this.detailWriter.logExtractedData(
            ctx,
            stepKey,
            adapterCode,
            records,
            options,
        );
    }

    async logLoadTargetData(
        ctx: RequestContext,
        stepKey: string,
        adapterCode: string,
        records: Record<string, unknown>[],
        options: LogEventOptions,
    ): Promise<void> {
        await this.detailWriter.logLoadTargetData(
            ctx,
            stepKey,
            adapterCode,
            records,
            options,
        );
    }

    async logFieldMappings(
        ctx: RequestContext,
        stepKey: string,
        adapterCode: string,
        inputRecord: Record<string, unknown>,
        outputRecord: Record<string, unknown>,
        options: LogEventOptions,
    ): Promise<void> {
        await this.detailWriter.logFieldMappings(
            ctx,
            stepKey,
            adapterCode,
            inputRecord,
            outputRecord,
            options,
        );
    }

    async logRecordTransformation(
        ctx: RequestContext,
        stepKey: string,
        recordIndex: number,
        sourceRecord: Record<string, unknown>,
        targetRecord: Record<string, unknown>,
        options: LogEventOptions,
    ): Promise<void> {
        await this.detailWriter.logRecordTransformation(
            ctx,
            stepKey,
            recordIndex,
            sourceRecord,
            targetRecord,
            options,
        );
    }

    async getCurrentLevel(): Promise<LogPersistenceLevel> {
        return this.persistencePolicy.getCurrentLevel();
    }
}
