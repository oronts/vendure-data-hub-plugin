/**
 * Pipeline Run Job Handler
 *
 * Async pipeline run execution via Vendure's job queue system.
 * Includes retry logic configuration and proper error categorization.
 */

import { Injectable, OnModuleInit, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import { ID, JobQueue, JobQueueService, EventBus } from '@vendure/core';
import { Subscription } from 'rxjs';
import { QUEUE_NAMES, LOGGER_CONTEXTS, HTTP } from '../../constants/index';
import { PipelineRunnerService } from '../../services/pipeline/pipeline-runner.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { PipelineRunJobData, JobOptions } from '../types';
import { PipelineQueueRequestEvent } from '../../services/events/pipeline-events';
import { isRetryableError } from '../processors/job-processor';

/**
 * Default job queue configuration for pipeline runs
 */
const PIPELINE_JOB_DEFAULTS = {
    /** Default number of retries for failed jobs */
    RETRIES: HTTP.MAX_RETRIES,
    /** Default backoff delay in milliseconds */
    BACKOFF_DELAY_MS: HTTP.RETRY_DELAY_MS,
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

    constructor(
        private jobQueueService: JobQueueService,
        private eventBus: EventBus,
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
                    await this.runner.execute(runId);

                    const durationMs = Date.now() - startTime;
                    this.logger.debug('Pipeline run job completed', {
                        runId: String(runId),
                        jobId: String(job.id),
                        durationMs,
                    });
                } catch (error) {
                    const durationMs = Date.now() - startTime;
                    const err = error instanceof Error ? error : new Error(String(error));
                    const isRetryable = isRetryableError(err);

                    this.logger.error(
                        'Pipeline run job failed',
                        err,
                        {
                            runId,
                            jobId: job.id,
                            durationMs,
                            isRetryable,
                            attempt: job.attempts,
                        },
                    );

                    // Re-throw to let job queue handle retries
                    // Non-retryable errors should still be thrown to mark job as failed
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
            this.logger.debug('Received PipelineQueueRequestEvent', {
                runId: event.runId,
                pipelineId: event.pipelineId,
                triggeredBy: event.triggeredBy,
            });
            this.enqueueRun(event.runId).catch(error => {
                this.logger.error(
                    'Failed to enqueue run from event',
                    error instanceof Error ? error : new Error(String(error)),
                    { runId: event.runId, pipelineId: event.pipelineId },
                );
            });
        });
    }

    /**
     * Cleanup event subscription on module destroy
     */
    onModuleDestroy(): void {
        if (this.eventSubscription) {
            this.eventSubscription.unsubscribe();
        }
    }

    /**
     * Enqueue a pipeline run for async execution
     *
     * @param runId - The ID of the pipeline run to execute
     * @param options - Optional job options (retries, priority)
     */
    async enqueueRun(runId: ID, options?: JobOptions): Promise<void> {
        if (!runId) {
            throw new Error('runId is required to enqueue a pipeline run');
        }

        this.logger.debug('Enqueueing pipeline run', {
            runId,
            retries: options?.retries ?? PIPELINE_JOB_DEFAULTS.RETRIES,
        });

        await this.queue.add(
            { runId },
            {
                retries: options?.retries ?? PIPELINE_JOB_DEFAULTS.RETRIES,
            },
        );
    }

    /**
     * Get the underlying job queue (for advanced operations)
     */
    getQueue(): JobQueue<PipelineRunJobData> {
        return this.queue;
    }
}
