import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { RequestContextService, TransactionalConnection, ID } from '@vendure/core';
import { In } from 'typeorm';
import { PipelineRun } from '../../entities/pipeline';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { RuntimeConfigService } from '../../services/runtime/runtime-config.service';
import { DistributedLockService } from '../../services/runtime/distributed-lock.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { RunStatus, PipelineDefinition, JsonObject } from '../../types/index';
import { TriggerType, TIMER_TYPE, TimerType } from '../../constants/enums';
import { findEnabledTriggersByType } from '../../utils';
import { ScheduledTimer } from '../types';
import { cronMatches, isValidTimezone } from '../processors/cron-processor';
import type { SchedulerConfig } from '../../types/plugin-options';
import { ConfigSyncService } from '../../bootstrap/seed-data';
import {
    type ActivePipelineDefinition,
    loadRunnablePipelineDefinitions,
} from '../../services/pipeline/active-pipeline-definitions';
import { PipelineRevisionMismatchError } from '../../services/pipeline/pipeline-policy';

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

interface ScheduleOccurrence {
    readonly key: string;
    readonly leaseTtlMs: number;
}

const CRON_OCCURRENCE_MS = 60_000;

function getScheduleOccurrence(
    triggerType: Exclude<TimerType, typeof TIMER_TYPE.REFRESH>,
    occurredAtMs: number,
    intervalMs?: number,
): ScheduleOccurrence {
    const durationMs = triggerType === TIMER_TYPE.CRON
        ? CRON_OCCURRENCE_MS
        : intervalMs;
    if (!durationMs || durationMs < 1 || !Number.isFinite(durationMs)) {
        throw new Error('A finite positive interval is required for interval schedule occurrences');
    }

    const bucket = Math.floor(occurredAtMs / durationMs);
    const occurrenceEndsAt = (bucket + 1) * durationMs;
    return {
        key: `${triggerType.toLowerCase()}:${bucket}`,
        leaseTtlMs: Math.max(1, occurrenceEndsAt - occurredAtMs),
    };
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
export class DataHubScheduleHandler implements OnApplicationBootstrap, OnModuleDestroy {
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

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private runtimeConfigService: RuntimeConfigService,
        private configSync: ConfigSyncService,
        private domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private distributedLock?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SCHEDULE_HANDLER);
        this.schedulerConfig = this.runtimeConfigService.getSchedulerConfig();
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.configSync.ensureSynchronized();
        const initMetadata: LogMetadata = {
            checkIntervalMs: this.schedulerConfig.checkIntervalMs,
            refreshIntervalMs: this.schedulerConfig.refreshIntervalMs,
            minIntervalMs: this.schedulerConfig.minIntervalMs,
            maxPipelineDiscovery: this.schedulerConfig.maxPipelineDiscovery,
            maxTrackingEntries: this.schedulerConfig.maxTrackingEntries,
            maxConsecutiveFailures: this.schedulerConfig.maxConsecutiveFailures,
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
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            const allPipelines = await loadRunnablePipelineDefinitions(
                this.connection,
                ctx,
                this.schedulerConfig.maxPipelineDiscovery,
            );

            let scheduledCount = 0;
            let skippedDueToFailures = 0;
            let skippedDueToTrackingLimit = 0;
            const desiredTimerKeys = new Set<string>();
            const activatedPipelineCodes = new Set<string>();
            const retainedFailureCodes = new Set<string>();

            for (const pipeline of allPipelines) {
                const definition = pipeline.definition as PipelineDefinition;
                const scheduleTriggers = findEnabledTriggersByType(definition, TriggerType.SCHEDULE);
                if (scheduleTriggers.length === 0) continue;

                const failureCount = this.failureCountByPipeline.get(pipeline.code) ?? 0;
                if (failureCount >= this.schedulerConfig.maxConsecutiveFailures) {
                    retainedFailureCodes.add(pipeline.code);
                    const circuitBreakerMetadata: LogMetadata = {
                        pipelineCode: pipeline.code,
                        failureCount,
                        maxAllowed: this.schedulerConfig.maxConsecutiveFailures,
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
                        this.logger.error('Schedule trigger has both interval and cron configured and was not activated', undefined, {
                            pipelineCode: pipeline.code,
                            triggerKey,
                        });
                    } else if (hasInterval) {
                        const effectiveIntervalMs = this.getEffectiveIntervalMs(config);
                        const signature = [
                            pipeline.id,
                            pipeline.revisionId,
                            TIMER_TYPE.INTERVAL,
                            effectiveIntervalMs,
                        ].join(':');
                        const timerKey = this.getTimerKey(
                            pipeline.code,
                            triggerKey,
                            TIMER_TYPE.INTERVAL,
                        );
                        if (!this.reserveScheduleSlot(desiredTimerKeys, timerKey)) {
                            skippedDueToTrackingLimit++;
                            continue;
                        }
                        retainedFailureCodes.add(pipeline.code);
                        if (!this.hasTimer(timerKey, signature)) {
                            this.removeTimer(timerKey);
                            this.setupIntervalSchedule(
                                pipeline,
                                config,
                                triggerKey,
                                signature,
                            );
                            activatedPipelineCodes.add(pipeline.code);
                        }
                        scheduledCount++;
                    } else if (hasCron) {
                        const signature = [
                            pipeline.id,
                            pipeline.revisionId,
                            TIMER_TYPE.CRON,
                            config.cron,
                            config.timezone,
                            this.schedulerConfig.checkIntervalMs,
                        ].join(':');
                        const timerKey = this.getTimerKey(
                            pipeline.code,
                            triggerKey,
                            TIMER_TYPE.CRON,
                        );
                        if (!this.reserveScheduleSlot(desiredTimerKeys, timerKey)) {
                            skippedDueToTrackingLimit++;
                            continue;
                        }
                        retainedFailureCodes.add(pipeline.code);
                        if (this.hasTimer(timerKey, signature)) {
                            scheduledCount++;
                        } else {
                            this.removeTimer(timerKey);
                            if (this.setupCronSchedule(
                                pipeline,
                                config,
                                triggerKey,
                                signature,
                            )) {
                                activatedPipelineCodes.add(pipeline.code);
                                scheduledCount++;
                            } else {
                                desiredTimerKeys.delete(timerKey);
                            }
                        }
                    } else {
                        this.logger.error('Schedule trigger has no executable cron or interval', undefined, {
                            pipelineCode: pipeline.code,
                            triggerKey,
                        });
                    }
                }
            }

            for (const timer of [...this.timers]) {
                if (timer.type === TIMER_TYPE.REFRESH) continue;
                const timerKey = this.getTimerKey(
                    timer.code,
                    timer.triggerKey,
                    timer.type,
                );
                if (!desiredTimerKeys.has(timerKey)) {
                    clearInterval(timer.handle);
                    this.timers = this.timers.filter(candidate => candidate !== timer);
                }
            }

            const activeTimers = this.timers.filter(t => t.type !== TIMER_TYPE.REFRESH);
            const activeCronKeys = new Set<string>(
                activeTimers
                    .filter(t => t.type === TIMER_TYPE.CRON && t.triggerKey)
                    .map(t => `${t.code}:${t.triggerKey}`)
            );
            const cleanedCronKeys = this.cleanupStaleCronKeys(activeCronKeys);
            const cleanedFailureCounts = this.cleanupStaleFailureCounts(retainedFailureCodes);

            const refreshDurationMs = Date.now() - refreshStartTime;

            // Publish ScheduleActivated for newly scheduled pipelines (one per unique pipeline code)
            if (activatedPipelineCodes.size > 0) {
                for (const code of activatedPipelineCodes) {
                    this.domainEvents.publishScheduleActivated(
                        undefined,
                        code,
                        activeTimers.filter(t => t.code === code).length,
                    );
                }
            }

            if (skippedDueToTrackingLimit > 0) {
                this.logger.error(
                    'Schedule tracking limit reached; excess schedules were not activated',
                    undefined,
                    {
                        maxTrackingEntries: this.schedulerConfig.maxTrackingEntries,
                        skippedSchedules: skippedDueToTrackingLimit,
                    },
                );
            }

            if (
                scheduledCount > 0
                || existingCount > 0
                || cleanedCronKeys > 0
                || skippedDueToFailures > 0
                || skippedDueToTrackingLimit > 0
            ) {
                const refreshMetadata: LogMetadata = {
                    recordCount: scheduledCount,
                    skippedDueToCircuitBreaker: skippedDueToFailures,
                    skippedDueToTrackingLimit,
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
                pipelineId,
                status: In([RunStatus.RUNNING, RunStatus.PENDING, RunStatus.PAUSED]),
            },
        });

        return !!activeRun;
    }

    private getEffectiveIntervalMs(config: ScheduleTriggerConfigParsed): number {
        const intervalSec = Math.max(1, config.intervalSec ?? 1);
        return Math.max(this.schedulerConfig.minIntervalMs, intervalSec * 1000);
    }

    private getTimerKey(
        code: string,
        triggerKey: string | undefined,
        type: TimerType,
    ): string {
        return `${code}:${triggerKey ?? ''}:${type}`;
    }

    private hasTimer(timerKey: string, signature: string): boolean {
        return this.timers.some(timer => (
            timer.type !== TIMER_TYPE.REFRESH
            && this.getTimerKey(timer.code, timer.triggerKey, timer.type) === timerKey
            && timer.signature === signature
        ));
    }

    private removeTimer(timerKey: string): void {
        for (const timer of [...this.timers]) {
            if (
                timer.type !== TIMER_TYPE.REFRESH
                && this.getTimerKey(timer.code, timer.triggerKey, timer.type) === timerKey
            ) {
                clearInterval(timer.handle);
                this.timers = this.timers.filter(candidate => candidate !== timer);
            }
        }
    }

    private removePipelineTimers(code: string): void {
        for (const timer of [...this.timers]) {
            if (timer.type !== TIMER_TYPE.REFRESH && timer.code === code) {
                clearInterval(timer.handle);
                this.timers = this.timers.filter(candidate => candidate !== timer);
            }
        }
    }

    private reserveScheduleSlot(
        desiredTimerKeys: Set<string>,
        timerKey: string,
    ): boolean {
        if (desiredTimerKeys.has(timerKey)) return true;
        if (desiredTimerKeys.size >= this.schedulerConfig.maxTrackingEntries) {
            return false;
        }
        desiredTimerKeys.add(timerKey);
        return true;
    }

    private recordCronMinute(cronTrackingKey: string, minuteKey: string): boolean {
        if (
            !this.lastCronKeyByPipeline.has(cronTrackingKey)
            && this.lastCronKeyByPipeline.size >= this.schedulerConfig.maxTrackingEntries
        ) {
            return false;
        }
        this.lastCronKeyByPipeline.set(cronTrackingKey, minuteKey);
        return true;
    }

    private recordPipelineFailure(pipelineCode: string, failureCount: number): boolean {
        if (
            !this.failureCountByPipeline.has(pipelineCode)
            && this.failureCountByPipeline.size >= this.schedulerConfig.maxTrackingEntries
        ) {
            return false;
        }
        this.failureCountByPipeline.set(pipelineCode, failureCount);
        return true;
    }

    private setupIntervalSchedule(
        pipeline: ActivePipelineDefinition,
        config: ScheduleTriggerConfigParsed,
        triggerKey: string,
        signature: string,
    ): void {
        const intervalSec = Math.max(1, config.intervalSec ?? 1);
        const effectiveIntervalMs = this.getEffectiveIntervalMs(config);

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
                    const occurrence = getScheduleOccurrence(
                        TIMER_TYPE.INTERVAL,
                        Date.now(),
                        effectiveIntervalMs,
                    );
                    await this.triggerPipeline(
                        pipeline,
                        TIMER_TYPE.INTERVAL,
                        triggerKey,
                        occurrence,
                    );
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
            signature,
        });
    }

    private setupCronSchedule(
        pipeline: ActivePipelineDefinition,
        config: ScheduleTriggerConfigParsed,
        triggerKey: string,
        signature: string,
    ): boolean {
        const cronExpr = config.cron ?? '';
        const timezone = config.timezone;
        if (timezone && !isValidTimezone(timezone)) {
            this.logger.error('Schedule trigger has an invalid timezone and was not activated', undefined, {
                pipelineCode: pipeline.code,
                triggerKey,
                cronExpr,
                invalidTimezone: timezone,
            });
            return false;
        }

        if (timezone) {
            this.logger.debug('Scheduling cron pipeline with timezone', {
                pipelineCode: pipeline.code,
                triggerKey,
                cronExpr,
                timezone,
                checkIntervalMs: this.schedulerConfig.checkIntervalMs,
            });
        } else {
            this.logger.debug('Scheduling cron pipeline (server timezone)', {
                pipelineCode: pipeline.code,
                triggerKey,
                cronExpr,
                checkIntervalMs: this.schedulerConfig.checkIntervalMs,
            });
        }

        const effectiveTimezone = timezone ?? undefined;

        const cronTrackingKey = `${pipeline.code}:${triggerKey}`;

        const handle = setInterval(
            async () => {
                try {
                    const now = new Date();
                    if (cronMatches(now, String(cronExpr), effectiveTimezone)) {
                        const occurrence = getScheduleOccurrence(
                            TIMER_TYPE.CRON,
                            now.getTime(),
                        );
                        const minuteKey = occurrence.key;
                        const lastKey = this.lastCronKeyByPipeline.get(cronTrackingKey);

                        if (lastKey !== minuteKey) {
                            if (!this.recordCronMinute(cronTrackingKey, minuteKey)) {
                                this.removeTimer(this.getTimerKey(
                                    pipeline.code,
                                    triggerKey,
                                    TIMER_TYPE.CRON,
                                ));
                                this.logger.error(
                                    'Cron schedule disabled because its execution cannot be tracked safely',
                                    undefined,
                                    {
                                        pipelineCode: pipeline.code,
                                        triggerKey,
                                        maxTrackingEntries: this.schedulerConfig.maxTrackingEntries,
                                    },
                                );
                                return;
                            }
                            await this.triggerPipeline(
                                pipeline,
                                TIMER_TYPE.CRON,
                                triggerKey,
                                occurrence,
                            );
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
            signature,
        });
        return true;
    }

    /** Claims one deterministic occurrence across all instances before starting a run. */
    private async triggerPipeline(
        pipeline: ActivePipelineDefinition,
        triggerType: Exclude<TimerType, typeof TIMER_TYPE.REFRESH>,
        triggerKey: string | undefined,
        occurrence: ScheduleOccurrence,
    ): Promise<void> {
        if (this.isDestroying) {
            this.logger.debug('Skipping pipeline trigger - module is being destroyed', {
                pipelineCode: pipeline.code,
            });
            return;
        }

        const lockKey = [
            'schedule-trigger',
            pipeline.id,
            triggerKey ?? 'default',
            occurrence.key,
        ].join(':');

        try {
            if (this.distributedLock) {
                const lockResult = await this.distributedLock.acquire(lockKey, {
                    ttlMs: occurrence.leaseTtlMs,
                    waitForLock: false,
                });

                if (!lockResult.acquired) {
                    this.logger.debug('Skipping scheduled trigger - another instance is handling it', {
                        pipelineCode: pipeline.code,
                        triggerKey,
                        currentOwner: lockResult.currentOwner,
                    });
                    return;
                }
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
            await this.pipelineService.startRun(ctx, pipeline.id, {
                skipPermissionCheck: true,
                triggeredBy,
                expectedRevisionId: pipeline.revisionId,
            });

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
            if (error instanceof PipelineRevisionMismatchError) {
                this.removePipelineTimers(pipeline.code);
                this.logger.info('Refreshing schedules after published revision changed', {
                    pipelineCode: pipeline.code,
                    triggerKey,
                });
                await this.refresh();
                return;
            }
            const currentFailures = this.failureCountByPipeline.get(pipeline.code) ?? 0;
            const newFailureCount = currentFailures + 1;
            if (!this.recordPipelineFailure(pipeline.code, newFailureCount)) {
                this.removePipelineTimers(pipeline.code);
                this.logger.error(
                    'Pipeline schedule disabled because its failures cannot be tracked safely',
                    undefined,
                    {
                        pipelineCode: pipeline.code,
                        maxTrackingEntries: this.schedulerConfig.maxTrackingEntries,
                    },
                );
                this.domainEvents.publishScheduleDeactivated(
                    String(pipeline.id),
                    pipeline.code,
                    'Scheduler failure tracking capacity exhausted',
                );
                return;
            }

            this.logger.error(
                'Failed to trigger scheduled pipeline',
                toErrorOrUndefined(error),
                {
                    pipelineCode: pipeline.code,
                    triggerType,
                    consecutiveFailures: newFailureCount,
                    willPauseSchedule: newFailureCount >= this.schedulerConfig.maxConsecutiveFailures,
                },
            );

            if (newFailureCount >= this.schedulerConfig.maxConsecutiveFailures) {
                this.removePipelineTimers(pipeline.code);
                this.domainEvents.publishScheduleDeactivated(
                    String(pipeline.id),
                    pipeline.code,
                    `Circuit breaker: ${newFailureCount} consecutive failures`,
                );
                const pauseMetadata: LogMetadata = {
                    pipelineCode: pipeline.code,
                    maxConsecutiveFailures: this.schedulerConfig.maxConsecutiveFailures,
                };
                this.logger.warn('Pipeline schedule will be paused - exceeded max consecutive failures', pauseMetadata);
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
        for (const key of this.lastCronKeyByPipeline.keys()) {
            if (key === code || key.startsWith(`${code}:`)) {
                this.lastCronKeyByPipeline.delete(key);
            }
        }
        this.logger.debug('Cleared cron keys for pipeline', { pipelineCode: code });
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
                isPaused: count >= this.schedulerConfig.maxConsecutiveFailures,
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
            if (count >= this.schedulerConfig.maxConsecutiveFailures) {
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
