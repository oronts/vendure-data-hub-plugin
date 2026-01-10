/**
 * Pipeline Run Job Handler
 *
 * Handles async pipeline run execution via Vendure's job queue system.
 */

import { Injectable, OnModuleInit, forwardRef, Inject } from '@nestjs/common';
import { ID, JobQueue, JobQueueService } from '@vendure/core';
import { QUEUE_NAMES, LOGGER_CONTEXTS } from '../../constants/index';
// Direct imports to avoid circular dependencies
import { PipelineRunnerService } from '../../services/pipeline/pipeline-runner.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { PipelineRunJobData } from '../types';

/**
 * DataHub Run Queue Handler
 *
 * Creates and manages the job queue for pipeline run execution.
 * Jobs are added when a pipeline run is triggered and processed
 * asynchronously by the PipelineRunnerService.
 */
@Injectable()
export class DataHubRunQueueHandler implements OnModuleInit {
    private queue!: JobQueue<PipelineRunJobData>;
    private readonly logger: DataHubLogger;

    constructor(
        private jobQueueService: JobQueueService,
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
                        runId,
                        jobId: job.id,
                        durationMs,
                    } as any);
                } catch (error) {
                    const durationMs = Date.now() - startTime;
                    this.logger.error(
                        'Pipeline run job failed',
                        error instanceof Error ? error : new Error(String(error)),
                        {
                            runId,
                            jobId: job.id,
                            durationMs,
                        },
                    );
                    throw error; // Re-throw to let job queue handle retries
                }
            },
        });

        this.logger.info('Pipeline run job queue initialized', {
            queueName: QUEUE_NAMES.RUN,
        } as any);
    }

    /**
     * Enqueue a pipeline run for async execution
     *
     * @param runId - The ID of the pipeline run to execute
     */
    async enqueueRun(runId: ID): Promise<void> {
        this.logger.debug('Enqueueing pipeline run', { runId });
        await this.queue.add({ runId });
    }

    /**
     * Get the underlying job queue (for advanced operations)
     */
    getQueue(): JobQueue<PipelineRunJobData> {
        return this.queue;
    }
}
