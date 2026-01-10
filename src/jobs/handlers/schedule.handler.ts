/**
 * Schedule Job Handler
 *
 * Manages scheduled pipeline execution using interval and cron triggers.
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RequestContextService, TransactionalConnection, ID } from '@vendure/core';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
// Direct imports to avoid circular dependencies
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { RuntimeConfigService } from '../../services/runtime/runtime-config.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { RunStatus } from '../../types/index';
import { ScheduledTimer } from '../types';
import { cronMatches, isValidTimezone } from '../processors/cron-processor';
import type { SchedulerConfig } from '../../types/plugin-options';

/**
 * DataHub Schedule Handler
 *
 * Manages scheduled pipeline execution by:
 * - Polling for enabled pipelines with schedule triggers
 * - Setting up interval-based timers
 * - Setting up cron-based timers with minute-level precision
 * - Automatically refreshing schedules when pipelines change
 * - Preventing concurrent runs of the same pipeline (concurrency control)
 */
@Injectable()
export class DataHubScheduleHandler implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly schedulerConfig: Required<SchedulerConfig>;
    private timers: ScheduledTimer[] = [];
    private lastCronKeyByPipeline = new Map<string, string>();
    /** Mutex flag to prevent concurrent refresh operations */
    private isRefreshing = false;
    /** Flag to track if module is being destroyed */
    private isDestroying = false;
    /** Track consecutive failures per pipeline for circuit breaker pattern */
    private failureCountByPipeline = new Map<string, number>();
    /** Maximum consecutive failures before pausing a pipeline's schedule */
    private readonly maxConsecutiveFailures = 5;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private runtimeConfigService: RuntimeConfigService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SCHEDULE_HANDLER);
        this.schedulerConfig = this.runtimeConfigService.getSchedulerConfig();
    }

    /**
     * Initialize schedules on module startup
     */
    async onModuleInit(): Promise<void> {
        this.logger.info('Initializing schedule handler', {
            checkIntervalMs: this.schedulerConfig.checkIntervalMs,
            refreshIntervalMs: this.schedulerConfig.refreshIntervalMs,
            minIntervalMs: this.schedulerConfig.minIntervalMs,
        } as any);
        await this.refresh();

        // Periodically refresh schedules in case pipelines change
        const refreshHandle = setInterval(
            () => this.refresh().catch(err => {
                this.logger.error('Failed to refresh schedules', err instanceof Error ? err : undefined, {});
            }),
            this.schedulerConfig.refreshIntervalMs,
        );
        this.timers.push({
            code: '__refresh__',
            handle: refreshHandle,
            type: 'refresh',
        });
    }

    /**
     * Clean up timers on module destroy
     */
    async onModuleDestroy(): Promise<void> {
        this.isDestroying = true;

        this.logger.info('Destroying schedule handler', {
            recordCount: this.timers.length,
            cronKeyCount: this.lastCronKeyByPipeline.size,
            failureTrackingCount: this.failureCountByPipeline.size,
        } as any);

        // Clear all timers
        for (const timer of this.timers) {
            clearInterval(timer.handle);
        }
        this.timers = [];

        // Clear all maps to prevent memory leaks
        this.lastCronKeyByPipeline.clear();
        this.failureCountByPipeline.clear();

        this.logger.debug('Schedule handler cleanup complete');
    }

    /**
     * Refresh all scheduled pipelines
     * Uses a mutex to prevent concurrent refresh operations which could cause race conditions
     */
    private async refresh(): Promise<void> {
        // Prevent refresh during shutdown
        if (this.isDestroying) {
            this.logger.debug('Skipping refresh - module is being destroyed');
            return;
        }

        // Mutex check to prevent concurrent refresh operations
        if (this.isRefreshing) {
            this.logger.debug('Skipping refresh - another refresh is already in progress');
            return;
        }

        this.isRefreshing = true;
        const refreshStartTime = Date.now();

        try {
            // Clear existing non-refresh timers
            const existingCount = this.timers.filter(t => t.type !== 'refresh').length;

            for (const timer of this.timers.filter(t => t.type !== 'refresh')) {
                clearInterval(timer.handle);
            }
            this.timers = this.timers.filter(t => t.type === 'refresh');

            // Fetch all pipelines
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            const repo = this.connection.getRepository(ctx, Pipeline);
            const allPipelines = await repo.find();

            let scheduledCount = 0;
            let skippedDueToFailures = 0;

            for (const pipeline of allPipelines) {
                if (!pipeline.enabled) continue;
                // Only schedule PUBLISHED pipelines for automatic triggers
                if ((pipeline as any).status !== 'PUBLISHED') continue;

                const trigger = (pipeline.definition as any)?.steps?.[0];
                const config = trigger?.config ?? {};

                if (trigger?.type !== 'TRIGGER' || config.type !== 'schedule') {
                    continue;
                }

                // Check if pipeline is in circuit breaker state
                const failureCount = this.failureCountByPipeline.get(pipeline.code) ?? 0;
                if (failureCount >= this.maxConsecutiveFailures) {
                    this.logger.warn('Pipeline schedule paused due to consecutive failures (circuit breaker)', {
                        pipelineCode: pipeline.code,
                        failureCount,
                        maxAllowed: this.maxConsecutiveFailures,
                    } as any);
                    skippedDueToFailures++;
                    continue;
                }

                const hasInterval = Number(config.intervalSec ?? 0) > 0;
                const hasCron = typeof config.cron === 'string' && config.cron.trim().length > 0;

                if (hasInterval && hasCron) {
                    this.logger.warn('Pipeline has both interval and cron configured, using cron only', {
                        pipelineCode: pipeline.code,
                    } as any);
                    this.setupCronSchedule(pipeline, config);
                    scheduledCount++;
                } else if (hasInterval) {
                    this.setupIntervalSchedule(pipeline, config);
                    scheduledCount++;
                } else if (hasCron) {
                    this.setupCronSchedule(pipeline, config);
                    scheduledCount++;
                }
            }

            // Build set of currently scheduled pipeline codes and clean up stale entries
            const activePipelineCodes = new Set<string>(
                this.timers
                    .filter(t => t.type !== 'refresh')
                    .map(t => t.code)
            );
            const cleanedCronKeys = this.cleanupStaleCronKeys(activePipelineCodes);
            const cleanedFailureCounts = this.cleanupStaleFailureCounts(activePipelineCodes);

            const refreshDurationMs = Date.now() - refreshStartTime;

            if (scheduledCount > 0 || existingCount > 0 || cleanedCronKeys > 0 || skippedDueToFailures > 0) {
                this.logger.info('Schedule refresh complete', {
                    recordCount: scheduledCount,
                    skippedDueToCircuitBreaker: skippedDueToFailures,
                    cleanedCronKeys,
                    cleanedFailureCounts,
                    activeCronKeyCount: this.lastCronKeyByPipeline.size,
                    refreshDurationMs,
                } as any);
            }
        } catch (error) {
            this.logger.error('Error during schedule refresh', error instanceof Error ? error : undefined, {
                refreshDurationMs: Date.now() - refreshStartTime,
            });
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Clean up stale cron keys for pipelines that are no longer scheduled
     * @param activePipelineCodes Set of currently active pipeline codes
     * @returns Number of removed entries
     */
    private cleanupStaleCronKeys(activePipelineCodes: Set<string>): number {
        let removedCount = 0;
        const staleCodes: string[] = [];

        for (const code of this.lastCronKeyByPipeline.keys()) {
            if (!activePipelineCodes.has(code)) {
                staleCodes.push(code);
            }
        }

        for (const code of staleCodes) {
            this.lastCronKeyByPipeline.delete(code);
            removedCount++;
        }

        if (removedCount > 0) {
            this.logger.debug('Cleaned up stale cron keys', {
                removedCount,
                stalePipelineCodes: staleCodes,
            } as any);
        }

        return removedCount;
    }

    /**
     * Clean up stale failure counts for pipelines that are no longer scheduled
     * This prevents memory leaks when pipelines are deleted or unscheduled
     * @param activePipelineCodes Set of currently active pipeline codes
     * @returns Number of removed entries
     */
    private cleanupStaleFailureCounts(activePipelineCodes: Set<string>): number {
        let removedCount = 0;
        const staleCodes: string[] = [];

        for (const code of this.failureCountByPipeline.keys()) {
            if (!activePipelineCodes.has(code)) {
                staleCodes.push(code);
            }
        }

        for (const code of staleCodes) {
            this.failureCountByPipeline.delete(code);
            removedCount++;
        }

        if (removedCount > 0) {
            this.logger.debug('Cleaned up stale failure counts', {
                removedCount,
                stalePipelineCodes: staleCodes,
            } as any);
        }

        return removedCount;
    }

    /**
     * Check if a pipeline is currently running
     * Used for concurrency control to prevent simultaneous runs
     * @param pipelineId Pipeline ID to check
     * @returns True if the pipeline has a running or pending run
     */
    private async isPipelineRunning(pipelineId: ID): Promise<boolean> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const runRepo = this.connection.getRepository(ctx, PipelineRun);

        const activeRun = await runRepo.findOne({
            where: {
                pipelineId: pipelineId as any,
                status: RunStatus.RUNNING as any,
            },
        });

        if (activeRun) {
            return true;
        }

        // Also check for pending runs that haven't started yet
        const pendingRun = await runRepo.findOne({
            where: {
                pipelineId: pipelineId as any,
                status: RunStatus.PENDING as any,
            },
        });

        return !!pendingRun;
    }

    /**
     * Set up an interval-based schedule for a pipeline
     */
    private setupIntervalSchedule(pipeline: Pipeline, config: any): void {
        const intervalSec = Math.max(1, Number(config.intervalSec));
        const effectiveIntervalMs = Math.max(this.schedulerConfig.minIntervalMs, intervalSec * 1000);

        this.logger.debug('Scheduling interval pipeline', {
            pipelineCode: pipeline.code,
            intervalSec,
            effectiveIntervalMs,
        } as any);

        const handle = setInterval(
            async () => {
                try {
                    await this.triggerPipeline(pipeline, 'interval');
                } catch (error) {
                    this.logger.error('Interval schedule callback failed', error instanceof Error ? error : undefined, {
                        pipelineCode: pipeline.code,
                    });
                }
            },
            effectiveIntervalMs,
        );

        this.timers.push({
            code: pipeline.code,
            handle,
            type: 'interval',
        });
    }

    /**
     * Set up a cron-based schedule for a pipeline
     */
    private setupCronSchedule(pipeline: Pipeline, config: any): void {
        const cronExpr = config.cron;
        // Extract timezone from config
        const timezone: string | undefined = config.timezone;
        const hasValidTimezone = timezone && isValidTimezone(timezone);

        // Log timezone configuration
        if (timezone) {
            if (hasValidTimezone) {
                this.logger.debug('Scheduling cron pipeline with timezone', {
                    pipelineCode: pipeline.code,
                    cronExpr,
                    timezone,
                    checkIntervalMs: this.schedulerConfig.checkIntervalMs,
                } as any);
            } else {
                this.logger.warn('Invalid timezone specified, falling back to server time', {
                    pipelineCode: pipeline.code,
                    cronExpr,
                    invalidTimezone: timezone,
                } as any);
            }
        } else {
            this.logger.debug('Scheduling cron pipeline (server timezone)', {
                pipelineCode: pipeline.code,
                cronExpr,
                checkIntervalMs: this.schedulerConfig.checkIntervalMs,
            } as any);
        }

        // Use valid timezone or undefined for server time
        const effectiveTimezone = hasValidTimezone ? timezone : undefined;

        const handle = setInterval(
            async () => {
                try {
                    const now = new Date();
                    if (cronMatches(now, String(cronExpr), effectiveTimezone)) {
                        const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
                        const lastKey = this.lastCronKeyByPipeline.get(pipeline.code);

                        if (lastKey !== minuteKey) {
                            await this.triggerPipeline(pipeline, 'cron');
                            this.lastCronKeyByPipeline.set(pipeline.code, minuteKey);
                        }
                    }
                } catch (error) {
                    this.logger.error('Cron schedule callback failed', error instanceof Error ? error : undefined, {
                        pipelineCode: pipeline.code,
                        cronExpr,
                        timezone: effectiveTimezone,
                    });
                }
            },
            this.schedulerConfig.checkIntervalMs,
        );

        this.timers.push({
            code: pipeline.code,
            handle,
            type: 'cron',
        });
    }

    /**
     * Trigger a pipeline run with concurrency control
     * Prevents simultaneous runs of the same pipeline and tracks failures
     */
    private async triggerPipeline(
        pipeline: Pipeline,
        triggerType: 'interval' | 'cron',
    ): Promise<void> {
        // Skip if module is being destroyed
        if (this.isDestroying) {
            this.logger.debug('Skipping pipeline trigger - module is being destroyed', {
                pipelineCode: pipeline.code,
            });
            return;
        }

        try {
            // Concurrency control: check if pipeline is already running
            const isRunning = await this.isPipelineRunning(pipeline.id);
            if (isRunning) {
                this.logger.info('Skipping scheduled run - pipeline already has an active run', {
                    pipelineCode: pipeline.code,
                    triggerType,
                } as any);
                return;
            }

            const ctx = await this.requestContextService.create({ apiType: 'admin' });

            this.logger.debug('Triggering scheduled pipeline run', {
                pipelineCode: pipeline.code,
                triggerType,
                currentFailureCount: this.failureCountByPipeline.get(pipeline.code) ?? 0,
            } as any);

            // Skip permission check for scheduled runs - pipeline was already configured by admin
            await this.pipelineService.startRun(ctx, pipeline.id as any, { skipPermissionCheck: true });

            // Reset failure count on successful trigger
            if (this.failureCountByPipeline.has(pipeline.code)) {
                this.failureCountByPipeline.delete(pipeline.code);
                this.logger.debug('Reset failure count after successful trigger', {
                    pipelineCode: pipeline.code,
                });
            }
        } catch (error) {
            // Track consecutive failures for circuit breaker
            const currentFailures = this.failureCountByPipeline.get(pipeline.code) ?? 0;
            const newFailureCount = currentFailures + 1;
            this.failureCountByPipeline.set(pipeline.code, newFailureCount);

            this.logger.error(
                'Failed to trigger scheduled pipeline',
                error instanceof Error ? error : undefined,
                {
                    pipelineCode: pipeline.code,
                    triggerType,
                    consecutiveFailures: newFailureCount,
                    willPauseSchedule: newFailureCount >= this.maxConsecutiveFailures,
                },
            );

            if (newFailureCount >= this.maxConsecutiveFailures) {
                this.logger.warn('Pipeline schedule will be paused - exceeded max consecutive failures', {
                    pipelineCode: pipeline.code,
                    maxConsecutiveFailures: this.maxConsecutiveFailures,
                } as any);
            }
        }
    }

    /**
     * Force refresh of all schedules
     */
    async forceRefresh(): Promise<void> {
        await this.refresh();
    }

    /**
     * Get count of active schedules
     */
    getActiveScheduleCount(): number {
        return this.timers.filter(t => t.type !== 'refresh').length;
    }

    /**
     * Get list of scheduled pipeline codes
     */
    getScheduledPipelines(): string[] {
        return this.timers
            .filter(t => t.type !== 'refresh')
            .map(t => t.code);
    }

    /**
     * Clear the cron key for a specific pipeline
     * Useful when a pipeline is deleted or disabled manually
     * @param code Pipeline code to clear
     */
    clearCronKeyForPipeline(code: string): void {
        if (this.lastCronKeyByPipeline.has(code)) {
            this.lastCronKeyByPipeline.delete(code);
            this.logger.debug('Cleared cron key for pipeline', {
                pipelineCode: code,
            } as any);
        }
    }

    /**
     * Get the current count of cron keys stored in memory
     * Useful for monitoring and debugging memory usage
     * @returns Number of cron keys currently stored
     */
    getCronKeyCount(): number {
        return this.lastCronKeyByPipeline.size;
    }

    /**
     * Reset the circuit breaker for a specific pipeline
     * Allows the pipeline to be scheduled again after failures
     * @param code Pipeline code to reset
     */
    resetCircuitBreaker(code: string): void {
        if (this.failureCountByPipeline.has(code)) {
            const previousCount = this.failureCountByPipeline.get(code);
            this.failureCountByPipeline.delete(code);
            this.logger.info('Circuit breaker reset for pipeline', {
                pipelineCode: code,
                previousFailureCount: previousCount,
            } as any);
        }
    }

    /**
     * Reset all circuit breakers
     * Allows all paused pipelines to be scheduled again
     */
    resetAllCircuitBreakers(): void {
        const count = this.failureCountByPipeline.size;
        this.failureCountByPipeline.clear();
        if (count > 0) {
            this.logger.info('All circuit breakers reset', {
                pipelinesReset: count,
            } as any);
        }
    }

    /**
     * Get circuit breaker status for all tracked pipelines
     * Useful for monitoring and debugging
     * @returns Map of pipeline codes to their failure counts
     */
    getCircuitBreakerStatus(): Map<string, { failureCount: number; isPaused: boolean }> {
        const status = new Map<string, { failureCount: number; isPaused: boolean }>();
        for (const [code, count] of this.failureCountByPipeline.entries()) {
            status.set(code, {
                failureCount: count,
                isPaused: count >= this.maxConsecutiveFailures,
            });
        }
        return status;
    }

    /**
     * Get scheduler health metrics
     * Returns comprehensive status information for monitoring
     */
    getHealthMetrics(): {
        activeTimers: number;
        cronKeyCount: number;
        trackedFailures: number;
        pausedPipelines: number;
        isRefreshing: boolean;
        isDestroying: boolean;
    } {
        let pausedCount = 0;
        for (const count of this.failureCountByPipeline.values()) {
            if (count >= this.maxConsecutiveFailures) {
                pausedCount++;
            }
        }

        return {
            activeTimers: this.timers.filter(t => t.type !== 'refresh').length,
            cronKeyCount: this.lastCronKeyByPipeline.size,
            trackedFailures: this.failureCountByPipeline.size,
            pausedPipelines: pausedCount,
            isRefreshing: this.isRefreshing,
            isDestroying: this.isDestroying,
        };
    }
}
