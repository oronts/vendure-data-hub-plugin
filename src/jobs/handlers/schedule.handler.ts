import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import {
    ConfigService,
    ProcessContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { RuntimeConfigService } from '../../services/runtime/runtime-config.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { PipelineDefinition } from '../../types/index';
import { TriggerType, TIMER_TYPE } from '../../constants/enums';
import { findEnabledTriggersByType } from '../../utils';
import type { SchedulerConfig } from '../../types/plugin-options';
import { ConfigSyncService } from '../../bootstrap/seed-data';
import { loadRunnablePipelineDefinitions } from '../../services/pipeline/active-pipeline-definitions';
import { ScheduledPipelineExecutionService } from './schedule-execution.service';
import { parseScheduleTriggerConfig } from './schedule-trigger';
import { ScheduleTimerService } from './schedule-timer.service';

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
export class DataHubScheduleHandler implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly schedulerConfig: Required<SchedulerConfig>;
    /** Mutex flag to prevent concurrent refresh operations */
    private isRefreshing = false;
    /** Flag to track if module is being destroyed */
    private isDestroying = false;
    private readonly executionCallbacks = {
        refreshSchedules: () => this.refresh(),
        removePipelineTimers: (pipelineCode: string) => {
            this.scheduleTimers.removePipelineTimers(pipelineCode);
        },
    };

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private configService: ConfigService,
        private processContext: ProcessContext,
        private runtimeConfigService: RuntimeConfigService,
        private configSync: ConfigSyncService,
        private domainEvents: DomainEventsService,
        private scheduleExecution: ScheduledPipelineExecutionService,
        private scheduleTimers: ScheduleTimerService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SCHEDULE_HANDLER);
        this.schedulerConfig = this.runtimeConfigService.getSchedulerConfig();
    }

    async onApplicationBootstrap(): Promise<void> {
        const runSchedules = this.configService.schedulerOptions
            .runTasksInWorkerOnly === false || this.processContext.isWorker;
        if (!runSchedules) {
            this.logger.debug(
                'Schedule handler is inactive in this process because Vendure schedules run in workers',
            );
            return;
        }
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
        this.scheduleTimers.addRefreshTimer(refreshHandle);
    }

    async onModuleDestroy(): Promise<void> {
        this.isDestroying = true;

        const destroyMetadata: LogMetadata = {
            recordCount: this.scheduleTimers.getTimerCount(),
            cronKeyCount: this.scheduleTimers.getCronKeyCount(),
            failureTrackingCount: this.scheduleExecution.getTrackedFailureCount(),
        };
        this.logger.info('Destroying schedule handler', destroyMetadata);

        this.scheduleExecution.destroy();
        this.scheduleTimers.destroy();

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
            const existingCount = this.scheduleTimers.getActiveScheduleCount();
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

                const failureCount = this.scheduleExecution.getFailureCount(pipeline.code);
                if (this.scheduleExecution.isCircuitOpen(pipeline.code)) {
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
                        const effectiveIntervalMs = this.scheduleTimers
                            .getEffectiveIntervalMs(config);
                        const signature = [
                            pipeline.id,
                            pipeline.revisionId,
                            TIMER_TYPE.INTERVAL,
                            effectiveIntervalMs,
                        ].join(':');
                        const timerKey = this.scheduleTimers.getTimerKey(
                            pipeline.code,
                            triggerKey,
                            TIMER_TYPE.INTERVAL,
                        );
                        if (!this.scheduleTimers.reserveScheduleSlot(
                            desiredTimerKeys,
                            timerKey,
                        )) {
                            skippedDueToTrackingLimit++;
                            continue;
                        }
                        retainedFailureCodes.add(pipeline.code);
                        if (!this.scheduleTimers.hasTimer(timerKey, signature)) {
                            this.scheduleTimers.removeTimer(timerKey);
                            this.scheduleTimers.setupIntervalSchedule(
                                pipeline,
                                config,
                                triggerKey,
                                signature,
                                this.executionCallbacks,
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
                        const timerKey = this.scheduleTimers.getTimerKey(
                            pipeline.code,
                            triggerKey,
                            TIMER_TYPE.CRON,
                        );
                        if (!this.scheduleTimers.reserveScheduleSlot(
                            desiredTimerKeys,
                            timerKey,
                        )) {
                            skippedDueToTrackingLimit++;
                            continue;
                        }
                        retainedFailureCodes.add(pipeline.code);
                        if (this.scheduleTimers.hasTimer(timerKey, signature)) {
                            scheduledCount++;
                        } else {
                            this.scheduleTimers.removeTimer(timerKey);
                            if (this.scheduleTimers.setupCronSchedule(
                                pipeline,
                                config,
                                triggerKey,
                                signature,
                                this.executionCallbacks,
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

            this.scheduleTimers.removeUndesiredTimers(desiredTimerKeys);

            const activeTimers = this.scheduleTimers.getActiveTimers();
            const activeCronKeys = new Set<string>(
                activeTimers
                    .filter(t => t.type === TIMER_TYPE.CRON && t.triggerKey)
                    .map(t => `${t.code}:${t.triggerKey}`)
            );
            const cleanedCronKeys = this.scheduleTimers
                .cleanupStaleCronKeys(activeCronKeys);
            const cleanedFailureCounts = this.scheduleExecution
                .cleanupStaleFailureCounts(retainedFailureCodes);

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
                    activeCronKeyCount: this.scheduleTimers.getCronKeyCount(),
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

    async forceRefresh(): Promise<void> {
        await this.refresh();
    }

    getActiveScheduleCount(): number {
        return this.scheduleTimers.getActiveScheduleCount();
    }

    getScheduledPipelines(): string[] {
        return this.scheduleTimers.getScheduledPipelines();
    }

    clearCronKeyForPipeline(code: string): void {
        this.scheduleTimers.clearCronKeyForPipeline(code);
    }

    getCronKeyCount(): number {
        return this.scheduleTimers.getCronKeyCount();
    }

    resetCircuitBreaker(code: string): void {
        this.scheduleExecution.resetCircuitBreaker(code);
    }

    resetAllCircuitBreakers(): void {
        this.scheduleExecution.resetAllCircuitBreakers();
    }

    getCircuitBreakerStatus(): Map<string, { failureCount: number; isPaused: boolean }> {
        return this.scheduleExecution.getCircuitBreakerStatus();
    }

    getHealthMetrics(): {
        activeTimers: number;
        cronKeyCount: number;
        trackedFailures: number;
        pausedPipelines: number;
        isRefreshing: boolean;
        isDestroying: boolean;
    } {
        return {
            activeTimers: this.scheduleTimers.getActiveScheduleCount(),
            cronKeyCount: this.scheduleTimers.getCronKeyCount(),
            trackedFailures: this.scheduleExecution.getTrackedFailureCount(),
            pausedPipelines: this.scheduleExecution.getPausedPipelineCount(),
            isRefreshing: this.isRefreshing,
            isDestroying: this.isDestroying,
        };
    }
}
