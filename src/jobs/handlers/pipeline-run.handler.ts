/**
 * Pipeline Run Job Handler
 *
 * Async pipeline run execution via Vendure's job queue system.
 * Includes retry logic configuration and proper error categorization.
 */

import { Injectable, OnModuleInit, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import {
    ID,
    JobQueue,
    JobQueueService,
    EventBus,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Subscription } from 'rxjs';
import { In, IsNull, LessThan, Not } from 'typeorm';
import {
    QUEUE_NAMES,
    LOGGER_CONTEXTS,
    HTTP,
    RUN_QUEUE_RECOVERY,
    RunStatus,
} from '../../constants/index';
import { PipelineRunnerService } from '../../services/pipeline/pipeline-runner.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { PipelineRunJobData, JobOptions } from '../types';
import { PipelineQueueRequestEvent } from '../../services/events/pipeline-events';
import { ensureError } from '../../utils/error.utils';
import { PipelineRun } from '../../entities/pipeline';

/**
 * Default job queue configuration for pipeline runs
 */
const PIPELINE_JOB_DEFAULTS = {
    /** Default number of retries for failed jobs */
    RETRIES: HTTP.MAX_RETRIES,
} as const;

/**
 * DataHub Run Queue Handler
 *
 * Creates and manages the job queue for pipeline run execution.
 * Jobs are added when a pipeline run is triggered and processed
 * asynchronously by the PipelineRunnerService.
 */
@Injectable()
export class DataHubRunQueueHandler implements OnModuleInit, OnModuleDestroy {
    private queue!: JobQueue<PipelineRunJobData>;
    private readonly logger: DataHubLogger;
    private eventSubscription?: Subscription;
    private reconcileHandle?: NodeJS.Timeout;
    private reconciliation: Promise<void> | null = null;
    private readonly activeDispatches = new Set<Promise<void>>();
    private destroying = false;

    constructor(
        private jobQueueService: JobQueueService,
        private eventBus: EventBus,
        private connection: TransactionalConnection,
        @Inject(forwardRef(() => PipelineRunnerService))
        private runner: PipelineRunnerService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.RUN_QUEUE_HANDLER);
    }

    /**
     * Initialize the job queue on module startup
     */
    async onModuleInit(): Promise<void> {
        this.queue = await this.jobQueueService.createQueue<PipelineRunJobData>({
            name: QUEUE_NAMES.RUN,
            process: async job => {
                const startTime = Date.now();
                const { runId } = job.data;

                this.logger.debug('Processing pipeline run job', {
                    runId,
                    jobId: job.id,
                });

                try {
                    await this.runner.execute(runId, {
                        attempt: job.attempts,
                        maxAttempts: job.retries + 1,
                    });

                    const durationMs = Date.now() - startTime;
                    this.logger.debug('Pipeline run job completed', {
                        runId: String(runId),
                        jobId: String(job.id),
                        durationMs,
                    });
                } catch (error) {
                    const durationMs = Date.now() - startTime;
                    const err = ensureError(error);

                    this.logger.error(
                        'Pipeline run job failed',
                        err,
                        {
                            runId,
                            jobId: job.id,
                            durationMs,
                            attempt: job.attempts,
                        },
                    );

                    // Vendure owns retry exhaustion for every rejected queue attempt.
                    throw error;
                }
            },
        });

        this.logger.info('Pipeline run job queue initialized', {
            queueName: QUEUE_NAMES.RUN,
        });

        // Subscribe to PipelineQueueRequestEvent to handle queue requests
        // This breaks the circular dependency: PipelineService -> EventBus -> DataHubRunQueueHandler
        this.eventSubscription = this.eventBus.ofType(PipelineQueueRequestEvent).subscribe(event => {
            if (this.destroying) return;
            this.logger.debug('Received PipelineQueueRequestEvent', {
                runId: event.runId,
                pipelineId: event.pipelineId,
                triggeredBy: event.triggeredBy,
            });
            this.dispatchRun(event.ctx, event.runId).catch(error => {
                this.logger.error(
                    'Failed to enqueue run from event',
                    ensureError(error),
                    { runId: event.runId, pipelineId: event.pipelineId },
                );
            });
        });

        await this.runReconciliation();
        if (this.destroying) return;
        this.reconcileHandle = setInterval(() => {
            this.runReconciliation().catch(error => {
                this.logger.error(
                    'Failed to reconcile pending pipeline runs',
                    ensureError(error),
                );
            });
        }, RUN_QUEUE_RECOVERY.RECONCILE_INTERVAL_MS);
        this.reconcileHandle.unref?.();
    }

    /**
     * Cleanup event subscription on module destroy
     */
    async onModuleDestroy(): Promise<void> {
        this.destroying = true;
        if (this.eventSubscription) {
            this.eventSubscription.unsubscribe();
            this.eventSubscription = undefined;
        }
        if (this.reconcileHandle) {
            clearInterval(this.reconcileHandle);
            this.reconcileHandle = undefined;
        }
        await this.reconciliation?.catch(() => undefined);
        await Promise.allSettled([...this.activeDispatches]);
    }

    /**
     * Enqueue a pipeline run for async execution
     *
     * @param runId - The ID of the pipeline run to execute
     * @param options - Optional job options (retries, priority)
     */
    async enqueueRun(runId: ID, options?: JobOptions): Promise<void> {
        return this.dispatchRun(RequestContext.empty(), runId, options);
    }

    private async dispatchRun(
        ctx: RequestContext,
        runId: ID,
        options?: JobOptions,
    ): Promise<void> {
        if (this.destroying) return;
        const dispatch = this.performDispatch(ctx, runId, options);
        this.activeDispatches.add(dispatch);
        void dispatch.then(
            () => this.activeDispatches.delete(dispatch),
            () => this.activeDispatches.delete(dispatch),
        );
        return dispatch;
    }

    private async performDispatch(
        ctx: RequestContext,
        runId: ID,
        options?: JobOptions,
    ): Promise<void> {
        if (!runId) {
            throw new Error('runId is required to enqueue a pipeline run');
        }

        const dispatchedAt = await this.claimDispatch(ctx, runId);
        if (!dispatchedAt) {
            this.logger.debug('Pipeline run queue request already dispatched', {
                runId,
            });
            return;
        }
        if (this.destroying) {
            await this.releaseDispatchClaim(ctx, runId, dispatchedAt);
            return;
        }

        this.logger.debug('Enqueueing pipeline run', {
            runId,
            retries: options?.retries ?? PIPELINE_JOB_DEFAULTS.RETRIES,
        });

        try {
            await this.queue.add(
                { runId },
                {
                    retries: options?.retries ?? PIPELINE_JOB_DEFAULTS.RETRIES,
                },
            );
        } catch (error) {
            await this.releaseDispatchClaim(ctx, runId, dispatchedAt);
            throw error;
        }
    }

    private async claimDispatch(
        ctx: RequestContext,
        runId: ID,
    ): Promise<Date | null> {
        const repository = this.connection.getRepository(ctx, PipelineRun);
        const dispatchedAt = new Date();
        const baseCriteria = {
            id: runId,
            status: In([RunStatus.PENDING, RunStatus.RUNNING]),
            queueRequestedAt: Not(IsNull()),
        };
        const freshClaim = await repository.update(
            {
                ...baseCriteria,
                queueDispatchedAt: IsNull(),
            },
            { queueDispatchedAt: dispatchedAt },
        );
        if (freshClaim.affected === 1) {
            return dispatchedAt;
        }

        const staleBefore = new Date(
            dispatchedAt.getTime() - RUN_QUEUE_RECOVERY.DISPATCH_STALE_MS,
        );
        const staleClaim = await repository.update(
            {
                ...baseCriteria,
                queueDispatchedAt: LessThan(staleBefore),
            },
            { queueDispatchedAt: dispatchedAt },
        );
        return staleClaim.affected === 1 ? dispatchedAt : null;
    }

    private async releaseDispatchClaim(
        ctx: RequestContext,
        runId: ID,
        dispatchedAt: Date,
    ): Promise<void> {
        await this.connection.getRepository(ctx, PipelineRun).update(
            {
                id: runId,
                queueDispatchedAt: dispatchedAt,
            },
            { queueDispatchedAt: null },
        );
    }

    private async reconcilePendingRuns(): Promise<void> {
        const ctx = RequestContext.empty();
        const runs = await this.connection.getRepository(ctx, PipelineRun).find({
            where: [
                {
                    status: RunStatus.PENDING,
                    queueRequestedAt: Not(IsNull()),
                },
                {
                    status: RunStatus.RUNNING,
                    queueRequestedAt: Not(IsNull()),
                },
            ],
            order: { queueRequestedAt: 'ASC' },
            take: RUN_QUEUE_RECOVERY.BATCH_SIZE,
        });
        for (const run of runs) {
            if (this.destroying) return;
            try {
                await this.dispatchRun(ctx, run.id);
            } catch (error) {
                this.logger.error(
                    'Failed to recover pipeline run queue request',
                    ensureError(error),
                    { runId: run.id },
                );
            }
        }
    }

    private async runReconciliation(): Promise<void> {
        if (this.destroying || this.reconciliation) return;
        const reconciliation = this.reconcilePendingRuns();
        this.reconciliation = reconciliation;
        await reconciliation.finally(() => {
            if (this.reconciliation === reconciliation) {
                this.reconciliation = null;
            }
        });
    }

    /**
     * Get the underlying job queue (for advanced operations)
     */
    getQueue(): JobQueue<PipelineRunJobData> {
        return this.queue;
    }
}
