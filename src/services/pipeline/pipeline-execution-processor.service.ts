import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type { Repository } from 'typeorm';
import {
    clearPipelineRunGateState,
    PipelineRun,
} from '../../entities/pipeline';
import {
    HookStage,
    RunStatus,
} from '../../constants/enums';
import {
    JsonObject,
    PipelineDefinition,
    PipelineMetrics,
} from '../../types';
import {
    readSeededGraphCheckpoint,
    type SeededGraphInput,
} from '../../runtime/orchestration';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { RecordErrorService } from '../data/record-error.service';
import {
    DataHubLogger,
    ExecutionLogger,
} from '../logger';
import { calculateThroughput } from '../../constants';
import { DomainEventsService } from '../events/domain-events.service';
import { HookService } from '../events/hook.service';

interface ProcessingContext {
    ctx: RequestContext;
    runId: ID;
    pipelineId: ID | undefined;
    pipelineCode?: string;
    runLogger: DataHubLogger;
    runRepo: Repository<PipelineRun>;
    start: number;
    seed?: SeededGraphInput;
    assertLeaseHeld?: () => void;
}

interface ProcessingCallbacks {
    onCancelRequested: () => Promise<boolean>;
    onRecordError: (
        stepKey: string,
        message: string,
        payload: Record<string, unknown>,
        stackTrace?: string,
    ) => Promise<void>;
}

@Injectable()
export class PipelineExecutionProcessorService {
    constructor(
        private connection: TransactionalConnection,
        private adapterRuntime: AdapterRuntimeService,
        private recordErrorService: RecordErrorService,
        private domainEvents: DomainEventsService,
        private hookService: HookService,
        private executionLogger: ExecutionLogger,
    ) {}

    async execute(
        ctx: RequestContext,
        runId: ID,
        definition: PipelineDefinition,
        pipelineId: ID | undefined,
        runLogger: DataHubLogger,
        assertLeaseHeld: () => void,
        isGateResume?: boolean,
        pipelineCode?: string,
    ): Promise<PipelineMetrics> {
        const processing = await this.loadContext(ctx, runId, pipelineId, runLogger);
        processing.pipelineCode = pipelineCode;
        processing.assertLeaseHeld = assertLeaseHeld;
        const callbacks = this.createCallbacks(processing, definition);
        return this.runSteps(definition, processing, callbacks, isGateResume);
    }

    private async loadContext(
        ctx: RequestContext,
        runId: ID,
        pipelineId: ID | undefined,
        runLogger: DataHubLogger,
    ): Promise<ProcessingContext> {
        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const run = await runRepo.findOne({ where: { id: runId } });
        const seed = readSeededGraphCheckpoint(run?.checkpoint);

        return {
            ctx,
            runId,
            pipelineId,
            runLogger,
            runRepo,
            start: Date.now(),
            seed,
        };
    }

    private createCallbacks(
        processing: ProcessingContext,
        definition: PipelineDefinition,
    ): ProcessingCallbacks {
        const {
            ctx,
            runId,
            pipelineId,
            runLogger,
            runRepo,
            start,
        } = processing;

        const onCancelRequested = async (): Promise<boolean> => {
            const current = await runRepo.findOne({ where: { id: runId } });
            if (current?.status !== RunStatus.CANCEL_REQUESTED) {
                return false;
            }
            runLogger.info('Pipeline cancellation requested', {
                durationMs: Date.now() - start,
            });
            current.status = RunStatus.CANCELLED;
            current.finishedAt = new Date();
            clearPipelineRunGateState(current);
            await runRepo.save(current, { reload: false });
            this.domainEvents.publishRunCancelled(
                pipelineId?.toString(),
                String(runId),
                ctx.activeUserId?.toString(),
            );
            return true;
        };

        const onRecordError = async (
            stepKey: string,
            message: string,
            payload: Record<string, unknown>,
            stackTrace?: string,
        ): Promise<void> => {
            await this.recordErrorService.record(
                ctx,
                runId,
                stepKey,
                message,
                payload as JsonObject,
                stackTrace,
            );
            await this.executionLogger.logRecordError(
                ctx,
                stepKey,
                message,
                payload,
                { pipelineId, runId },
                stackTrace,
            );
            try {
                await this.hookService.run(
                    ctx,
                    definition,
                    HookStage.ON_ERROR,
                    { error: message, stepKey } as unknown as JsonObject,
                    payload as JsonObject,
                    runId,
                );
            } catch {
                // Error hooks are best-effort observability and never block execution.
            }
        };

        return { onCancelRequested, onRecordError };
    }

    private async runSteps(
        definition: PipelineDefinition,
        processing: ProcessingContext,
        callbacks: ProcessingCallbacks,
        isGateResume?: boolean,
    ): Promise<PipelineMetrics> {
        const {
            ctx,
            runId,
            pipelineId,
            runLogger,
            start,
            seed,
        } = processing;
        const result = await this.adapterRuntime.executePipeline(
            ctx,
            definition,
            callbacks.onCancelRequested,
            callbacks.onRecordError,
            pipelineId,
            runId,
            {
                resume: isGateResume || undefined,
                pipelineCode: processing.pipelineCode,
                seed,
            },
        );
        const durationMs = Date.now() - start;

        runLogger.debug('Pipeline processing completed', {
            recordCount: result.processed,
            sourceRecordCount: result.sourceRecords,
            recordsSucceeded: result.succeeded,
            recordsFailed: result.failed,
            recordsSkipped: result.skipped,
            durationMs,
            throughput: calculateThroughput(result.processed, durationMs),
        });

        const details = result as typeof result & {
            details?: JsonObject[];
            paused?: boolean;
            pausedAtStep?: string;
        };
        return {
            totalRecords: result.processed,
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            skipped: result.skipped,
            sourceRecords: result.sourceRecords,
            durationMs,
            details: details.details,
            paused: details.paused,
            pausedAtStep: details.pausedAtStep,
        };
    }
}
