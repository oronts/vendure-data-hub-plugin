import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { RequestContextService, TransactionalConnection, ID } from '@vendure/core';
import { In } from 'typeorm';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { RuntimeConfigService } from '../../services/runtime/runtime-config.service';
import { DistributedLockService } from '../../services/runtime/distributed-lock.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { LOGGER_CONTEXTS, DISTRIBUTED_LOCK } from '../../constants/index';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { RunStatus, PipelineDefinition, JsonObject } from '../../types/index';
import { PipelineStatus, TriggerType, TIMER_TYPE, TimerType } from '../../constants/enums';
import { findEnabledTriggersByType } from '../../utils';
import { ScheduledTimer } from '../types';
import { cronMatches, isValidTimezone } from '../processors/cron-processor';
import type { SchedulerConfig } from '../../types/plugin-options';

interface ScheduleTriggerConfigParsed {
    type: typeof TriggerType.SCHEDULE;
    cron: string | null;
    intervalSec: number | null;
    timezone: string | null;
}

function parseScheduleTriggerConfig(config: JsonObject): ScheduleTriggerConfigParsed | null {
    if (!config || typeof config !== 'object') return null;
    if (config.type !== TriggerType.SCHEDULE) return null;

    return {
        type: TriggerType.SCHEDULE,
        cron: typeof config.cron === 'string' ? config.cron : null,
        intervalSec: typeof config.intervalSec === 'number' ? config.intervalSec : null,
        timezone: typeof config.timezone === 'string' ? config.timezone : null,
    };
}

interface LogMetadata {
    [key: string]: string | number | boolean | undefined;
}

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
    /** Safety cap for tracking maps to prevent unbounded memory growth */
    private readonly maxTrackingEntries = 1000;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private runtimeConfigService: RuntimeConfigService,
        private domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private distributedLock?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SCHEDULE_HANDLER);
        this.schedulerConfig = this.runtimeConfigService.getSchedulerConfig();
    }

    async onModuleInit(): Promise<void> {
        const initMetadata: LogMetadata = {
            checkIntervalMs: this.schedulerConfig.checkIntervalMs,
            refreshIntervalMs: this.schedulerConfig.refreshIntervalMs,
            minIntervalMs: this.schedulerConfig.minIntervalMs,
        };
        this.logger.info('Initializing schedule handler', initMetadata);
        try {
            await this.refresh();
        } catch (error) {
            const errorMetadata: LogMetadata = {
                error: getErrorMessage(error),
            };
            this.logger.warn('Failed to initialize schedules on startup, will retry on next refresh', errorMetadata);
        }

        const refreshHandle = setInterval(
            () => this.refresh().catch(err => {
                this.logger.error('Failed to refresh schedules', toErrorOrUndefined(err), {});
            }),
            this.schedulerConfig.refreshIntervalMs,
        );
        refreshHandle.unref();
        this.timers.push({
            code: '__refresh__',
            handle: refreshHandle,
            type: TIMER_TYPE.REFRESH,
        });
    }

    async onModuleDestroy(): Promise<void> {
        this.isDestroying = true;

        const destroyMetadata: LogMetadata = {
            recordCount: this.timers.length,
            cronKeyCount: this.lastCronKeyByPipeline.size,
            failureTrackingCount: this.failureCountByPipeline.size,
        };
        this.logger.info('Destroying schedule handler', destroyMetadata);

        for (const timer of this.timers) {
            clearInterval(timer.handle);
        }
        this.timers = [];

        this.lastCronKeyByPipeline.clear();
        this.failureCountByPipeline.clear();

        this.logger.debug('Schedule handler cleanup complete');
    }

    /** Uses a mutex to prevent concurrent refresh operations */
    private async refresh(): Promise<void> {
        if (this.isDestroying) {
            this.logger.debug('Skipping refresh - module is being destroyed');
            return;
        }

        if (this.isRefreshing) {
            this.logger.debug('Skipping refresh - another refresh is already in progress');
            return;
        }

        this.isRefreshing = true;
        const refreshStartTime = Date.now();

        try {
            const existingCount = this.timers.filter(t => t.type !== TIMER_TYPE.REFRESH).length;

            for (const timer of this.timers.filter(t => t.type !== TIMER_TYPE.REFRESH)) {
                clearInterval(timer.handle);
            }
            this.timers = this.timers.filter(t => t.type === TIMER_TYPE.REFRESH);

            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            const repo = this.connection.getRepository(ctx, Pipeline);
            const allPipelines = await repo.find();

            let scheduledCount = 0;
            let skippedDueToFailures = 0;

            for (const pipeline of allPipelines) {
                if (!pipeline.enabled) continue;
                if (pipeline.status !== PipelineStatus.PUBLISHED) continue;

                const definition = pipeline.definition as PipelineDefinition;
                const scheduleTriggers = findEnabledTriggersByType(definition, TriggerType.SCHEDULE);
                if (scheduleTriggers.length === 0) continue;

                const failureCount = this.failureCountByPipeline.get(pipeline.code) ?? 0;
                if (failureCount >= this.maxConsecutiveFailures) {
                    const circuitBreakerMetadata: LogMetadata = {
                        pipelineCode: pipeline.code,
                        failureCount,
                        maxAllowed: this.maxConsecutiveFailures,
                    };
                    this.logger.warn('Pipeline schedule paused due to consecutive failures (circuit breaker)', circuitBreakerMetadata);
                    skippedDueToFailures++;
                    continue;
                }

                for (const trigger of scheduleTriggers) {
                    const triggerKey = trigger.key;
                    const config = parseScheduleTriggerConfig(trigger.config);
                    if (!config) continue;

                    const hasInterval = (config.intervalSec ?? 0) > 0;
                    const hasCron = config.cron !== null && config.cron.trim().length > 0;

                    if (hasInterval && hasCron) {
                        const warnMetadata: LogMetadata = { pipelineCode: pipeline.code, triggerKey };
                        this.logger.warn('Schedule trigger has both interval and cron configured, using cron only', warnMetadata);
                        this.setupCronSchedule(pipeline, config, triggerKey);
                        scheduledCount++;
                    } else if (hasInterval) {
                        this.setupIntervalSchedule(pipeline, config, triggerKey);
                        scheduledCount++;
                    } else if (hasCron) {
                        this.setupCronSchedule(pipeline, config, triggerKey);
                        scheduledCount++;
                    }
                }
            }

            const activeTimers = this.timers.filter(t => t.type !== TIMER_TYPE.REFRESH);
            const activePipelineCodes = new Set<string>(activeTimers.map(t => t.code));
            const activeCronKeys = new Set<string>(
                activeTimers
                    .filter(t => t.type === TIMER_TYPE.CRON && t.triggerKey)
                    .map(t => `${t.code}:${t.triggerKey}`)
            );
            const cleanedCronKeys = this.cleanupStaleCronKeys(activeCronKeys);
            const cleanedFailureCounts = this.cleanupStaleFailureCounts(activePipelineCodes);

            const refreshDurationMs = Date.now() - refreshStartTime;

            // Publish ScheduleActivated for newly scheduled pipelines (one per unique pipeline code)
            if (scheduledCount > 0 && scheduledCount !== existingCount) {
                for (const code of activePipelineCodes) {
                    this.domainEvents.publishScheduleActivated(
                        undefined,
                        code,
                        activeTimers.filter(t => t.code === code).length,
                    );
                }
            }

            if (scheduledCount > 0 || existingCount > 0 || cleanedCronKeys > 0 || skippedDueToFailures > 0) {
                const refreshMetadata: LogMetadata = {
                    recordCount: scheduledCount,
                    skippedDueToCircuitBreaker: skippedDueToFailures,
                    cleanedCronKeys,
                    cleanedFailureCounts,
                    activeCronKeyCount: this.lastCronKeyByPipeline.size,
                    refreshDurationMs,
                };
                this.logger.info('Schedule refresh complete', refreshMetadata);
            }
        } catch (error) {
            this.logger.error('Error during schedule refresh', toErrorOrUndefined(error), {
                refreshDurationMs: Date.now() - refreshStartTime,
            });
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    private cleanupStaleCronKeys(activeCronKeys: Set<string>): number {
        let removedCount = 0;
        const staleCodes: string[] = [];

        for (const compositeKey of this.lastCronKeyByPipeline.keys()) {
            if (!activeCronKeys.has(compositeKey)) {
                staleCodes.push(compositeKey);
            }
        }

        for (const code of staleCodes) {
            this.lastCronKeyByPipeline.delete(code);
            removedCount++;
        }

        if (removedCount > 0) {
            this.logger.debug('Cleaned up stale cron keys', {
                removedCount,
                stalePipelineCodes: staleCodes.join(','),
            });
        }

        return removedCount;
    }

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
                stalePipelineCodes: staleCodes.join(','),
            });
        }

        return removedCount;
    }

    private async isPipelineRunning(pipelineId: ID): Promise<boolean> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const runRepo = this.connection.getRepository(ctx, PipelineRun);

        const activeRun = await runRepo.findOne({
            where: {
                pipelineId: Number(pipelineId),
                status: In([RunStatus.RUNNING, RunStatus.PENDING]),
            },
        });

        return !!activeRun;
    }

    private setupIntervalSchedule(pipeline: Pipeline, config: ScheduleTriggerConfigParsed, triggerKey: string): void {
        const intervalSec = Math.max(1, config.intervalSec ?? 1);
        const effectiveIntervalMs = Math.max(this.schedulerConfig.minIntervalMs, intervalSec * 1000);

        const intervalMetadata: LogMetadata = {
            pipelineCode: pipeline.code,
            triggerKey,
            intervalSec,
            effectiveIntervalMs,
        };
        this.logger.debug('Scheduling interval pipeline', intervalMetadata);

        const handle = setInterval(
            async () => {
                try {
                    await this.triggerPipeline(pipeline, TIMER_TYPE.INTERVAL, triggerKey);
                } catch (error) {
                    this.logger.error('Interval schedule callback failed', toErrorOrUndefined(error), {
                        pipelineCode: pipeline.code,
                        triggerKey,
                    });
                }
            },
            effectiveIntervalMs,
        );
        handle.unref();

        this.timers.push({
            code: pipeline.code,
            triggerKey,
            handle,
            type: TIMER_TYPE.INTERVAL,
        });
    }

    private setupCronSchedule(pipeline: Pipeline, config: ScheduleTriggerConfigParsed, triggerKey: string): void {
        const cronExpr = config.cron ?? '';
        const timezone = config.timezone;
        const hasValidTimezone = timezone !== null && isValidTimezone(timezone);

        if (timezone) {
            if (hasValidTimezone) {
                const tzMetadata: LogMetadata = {
                    pipelineCode: pipeline.code,
                    triggerKey,
                    cronExpr,
                    timezone,
                    checkIntervalMs: this.schedulerConfig.checkIntervalMs,
                };
                this.logger.debug('Scheduling cron pipeline with timezone', tzMetadata);
            } else {
                const invalidTzMetadata: LogMetadata = {
                    pipelineCode: pipeline.code,
                    triggerKey,
                    cronExpr,
                    invalidTimezone: timezone,
                };
                this.logger.warn('Invalid timezone specified, falling back to server time', invalidTzMetadata);
            }
        } else {
            const serverTzMetadata: LogMetadata = {
                pipelineCode: pipeline.code,
                triggerKey,
                cronExpr,
                checkIntervalMs: this.schedulerConfig.checkIntervalMs,
            };
            this.logger.debug('Scheduling cron pipeline (server timezone)', serverTzMetadata);
        }

        const effectiveTimezone = hasValidTimezone ? timezone : undefined;

        const cronTrackingKey = `${pipeline.code}:${triggerKey}`;

        const handle = setInterval(
            async () => {
                try {
                    const now = new Date();
                    if (cronMatches(now, String(cronExpr), effectiveTimezone)) {
                        const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
                        const lastKey = this.lastCronKeyByPipeline.get(cronTrackingKey);

                        if (lastKey !== minuteKey) {
                            await this.triggerPipeline(pipeline, TIMER_TYPE.CRON, triggerKey);
                            if (this.lastCronKeyByPipeline.size < this.maxTrackingEntries) {
                                this.lastCronKeyByPipeline.set(cronTrackingKey, minuteKey);
                            }
                        }
                    }
                } catch (error) {
                    this.logger.error('Cron schedule callback failed', toErrorOrUndefined(error), {
                        pipelineCode: pipeline.code,
                        triggerKey,
                        cronExpr,
                        timezone: effectiveTimezone,
                    });
                }
            },
            this.schedulerConfig.checkIntervalMs,
        );
        handle.unref();

        this.timers.push({
            code: pipeline.code,
            triggerKey,
            handle,
            type: TIMER_TYPE.CRON,
        });
    }

    /** Uses distributed locks to prevent simultaneous runs across instances */
    private async triggerPipeline(
        pipeline: Pipeline,
        triggerType: Exclude<TimerType, typeof TIMER_TYPE.REFRESH>,
        triggerKey?: string,
    ): Promise<void> {
        if (this.isDestroying) {
            this.logger.debug('Skipping pipeline trigger - module is being destroyed', {
                pipelineCode: pipeline.code,
            });
            return;
        }

        const lockKey = `schedule-trigger:${pipeline.id}:${triggerKey ?? 'default'}`;
        let lockToken: string | undefined;

        try {
            // Acquire distributed lock to prevent race conditions in multi-instance deployments
            if (this.distributedLock) {
                const lockResult = await this.distributedLock.acquire(lockKey, {
                    ttlMs: DISTRIBUTED_LOCK.SCHEDULER_LOCK_TTL_MS,
                    waitForLock: false, // Don't wait - another instance is handling it
                });

                if (!lockResult.acquired) {
                    this.logger.debug('Skipping scheduled trigger - another instance is handling it', {
                        pipelineCode: pipeline.code,
                        triggerKey,
                        currentOwner: lockResult.currentOwner,
                    });
                    return;
                }
                lockToken = lockResult.token;
            }

            const isRunning = await this.isPipelineRunning(pipeline.id);
            if (isRunning) {
                const skipMetadata: LogMetadata = {
                    pipelineCode: pipeline.code,
                    triggerType,
                };
                this.logger.info('Skipping scheduled run - pipeline already has an active run', skipMetadata);
                return;
            }

            const ctx = await this.requestContextService.create({ apiType: 'admin' });

            const triggerMetadata: LogMetadata = {
                pipelineCode: pipeline.code,
                triggerType,
                currentFailureCount: this.failureCountByPipeline.get(pipeline.code) ?? 0,
            };
            this.logger.debug('Triggering scheduled pipeline run', triggerMetadata);

            const triggeredBy = triggerKey ? `schedule:${triggerKey}` : 'schedule';
            await this.pipelineService.startRun(ctx, pipeline.id, { skipPermissionCheck: true, triggeredBy });

            this.domainEvents.publishTriggerFired(
                String(pipeline.id),
                'SCHEDULE',
                { pipelineCode: pipeline.code, triggerType, triggerKey },
            );

            if (this.failureCountByPipeline.has(pipeline.code)) {
                this.failureCountByPipeline.delete(pipeline.code);
                this.logger.debug('Reset failure count after successful trigger', {
                    pipelineCode: pipeline.code,
                });
            }
        } catch (error) {
            const currentFailures = this.failureCountByPipeline.get(pipeline.code) ?? 0;
            const newFailureCount = currentFailures + 1;
            if (this.failureCountByPipeline.size < this.maxTrackingEntries || this.failureCountByPipeline.has(pipeline.code)) {
                this.failureCountByPipeline.set(pipeline.code, newFailureCount);
            }

            this.logger.error(
                'Failed to trigger scheduled pipeline',
                toErrorOrUndefined(error),
                {
                    pipelineCode: pipeline.code,
                    triggerType,
                    consecutiveFailures: newFailureCount,
                    willPauseSchedule: newFailureCount >= this.maxConsecutiveFailures,
                },
            );

            if (newFailureCount >= this.maxConsecutiveFailures) {
                this.domainEvents.publishScheduleDeactivated(
                    String(pipeline.id),
                    pipeline.code,
                    `Circuit breaker: ${newFailureCount} consecutive failures`,
                );
                const pauseMetadata: LogMetadata = {
                    pipelineCode: pipeline.code,
                    maxConsecutiveFailures: this.maxConsecutiveFailures,
                };
                this.logger.warn('Pipeline schedule will be paused - exceeded max consecutive failures', pauseMetadata);
            }
        } finally {
            // Release the distributed lock
            if (this.distributedLock && lockToken) {
                try {
                    await this.distributedLock.release(lockKey, lockToken);
                } catch (lockError) {
                    this.logger.warn('Failed to release scheduler lock', {
                        lockKey,
                        error: getErrorMessage(lockError),
                    });
                }
            }
        }
    }

    async forceRefresh(): Promise<void> {
        await this.refresh();
    }

    getActiveScheduleCount(): number {
        return this.timers.filter(t => t.type !== TIMER_TYPE.REFRESH).length;
    }

    getScheduledPipelines(): string[] {
        return this.timers
            .filter(t => t.type !== TIMER_TYPE.REFRESH)
            .map(t => t.code);
    }

    clearCronKeyForPipeline(code: string): void {
        if (this.lastCronKeyByPipeline.has(code)) {
            this.lastCronKeyByPipeline.delete(code);
            this.logger.debug('Cleared cron key for pipeline', { pipelineCode: code });
        }
    }

    getCronKeyCount(): number {
        return this.lastCronKeyByPipeline.size;
    }

    resetCircuitBreaker(code: string): void {
        if (this.failureCountByPipeline.has(code)) {
            const previousCount = this.failureCountByPipeline.get(code);
            this.failureCountByPipeline.delete(code);
            const resetMetadata: LogMetadata = {
                pipelineCode: code,
                previousFailureCount: previousCount,
            };
            this.logger.info('Circuit breaker reset for pipeline', resetMetadata);
        }
    }

    resetAllCircuitBreakers(): void {
        const count = this.failureCountByPipeline.size;
        this.failureCountByPipeline.clear();
        if (count > 0) {
            this.logger.info('All circuit breakers reset', { pipelinesReset: count });
        }
    }

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
            activeTimers: this.timers.filter(t => t.type !== TIMER_TYPE.REFRESH).length,
            cronKeyCount: this.lastCronKeyByPipeline.size,
            trackedFailures: this.failureCountByPipeline.size,
            pausedPipelines: pausedCount,
            isRefreshing: this.isRefreshing,
            isDestroying: this.isDestroying,
        };
    }
}
