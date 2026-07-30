import { Injectable } from '@nestjs/common';
import { LOGGER_CONTEXTS } from '../../constants/core';
import { TIMER_TYPE, TimerType } from '../../constants/enums';
import { TIME_UNITS } from '../../constants/time';
import type { ActivePipelineDefinition } from '../../services/pipeline/active-pipeline-definitions';
import { DataHubLoggerFactory } from '../../services/logger';
import type { DataHubLogger } from '../../services/logger';
import { RuntimeConfigService } from '../../services/runtime/runtime-config.service';
import type { SchedulerConfig } from '../../types/plugin-options';
import { toErrorOrUndefined } from '../../utils/error.utils';
import { cronMatches, isValidTimezone } from '../processors/cron-processor';
import type { ScheduledTimer } from '../types';
import {
    ScheduledPipelineExecutionService,
} from './schedule-execution.service';
import type { ScheduleExecutionCallbacks } from './schedule-execution.service';
import {
    getScheduleOccurrence,
} from './schedule-trigger';
import type { ScheduleTriggerConfig } from './schedule-trigger';

@Injectable()
export class ScheduleTimerService {
    private readonly config: Required<SchedulerConfig>;
    private readonly logger: DataHubLogger;
    private readonly timers: ScheduledTimer[] = [];
    private readonly lastCronKeyByPipeline = new Map<string, string>();

    constructor(
        runtimeConfigService: RuntimeConfigService,
        private readonly scheduleExecution: ScheduledPipelineExecutionService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.config = runtimeConfigService.getSchedulerConfig();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SCHEDULE_HANDLER);
    }

    addRefreshTimer(handle: NodeJS.Timeout): void {
        this.timers.push({
            code: '__refresh__',
            handle,
            type: TIMER_TYPE.REFRESH,
        });
    }

    destroy(): void {
        for (const timer of this.timers.splice(0)) {
            clearInterval(timer.handle);
        }
        this.lastCronKeyByPipeline.clear();
    }

    getActiveTimers(): ScheduledTimer[] {
        return this.timers.filter(timer => timer.type !== TIMER_TYPE.REFRESH);
    }

    getActiveScheduleCount(): number {
        return this.getActiveTimers().length;
    }

    getScheduledPipelines(): string[] {
        return this.getActiveTimers().map(timer => timer.code);
    }

    getTimerCount(): number {
        return this.timers.length;
    }

    getCronKeyCount(): number {
        return this.lastCronKeyByPipeline.size;
    }

    getEffectiveIntervalMs(config: ScheduleTriggerConfig): number {
        const intervalSec = Math.max(1, config.intervalSec ?? 1);
        return Math.max(this.config.minIntervalMs, intervalSec * TIME_UNITS.SECOND);
    }

    getTimerKey(
        code: string,
        triggerKey: string | undefined,
        type: TimerType,
    ): string {
        return `${code}:${triggerKey ?? ''}:${type}`;
    }

    reserveScheduleSlot(
        desiredTimerKeys: Set<string>,
        timerKey: string,
    ): boolean {
        if (desiredTimerKeys.has(timerKey)) return true;
        if (desiredTimerKeys.size >= this.config.maxTrackingEntries) return false;
        desiredTimerKeys.add(timerKey);
        return true;
    }

    hasTimer(timerKey: string, signature: string): boolean {
        return this.timers.some(timer => (
            timer.type !== TIMER_TYPE.REFRESH
            && this.getTimerKey(timer.code, timer.triggerKey, timer.type) === timerKey
            && timer.signature === signature
        ));
    }

    removeTimer(timerKey: string): void {
        this.removeTimers(timer => (
            timer.type !== TIMER_TYPE.REFRESH
            && this.getTimerKey(timer.code, timer.triggerKey, timer.type) === timerKey
        ));
    }

    removePipelineTimers(code: string): void {
        this.removeTimers(timer => (
            timer.type !== TIMER_TYPE.REFRESH && timer.code === code
        ));
    }

    removeUndesiredTimers(desiredTimerKeys: ReadonlySet<string>): void {
        this.removeTimers(timer => (
            timer.type !== TIMER_TYPE.REFRESH
            && !desiredTimerKeys.has(this.getTimerKey(
                timer.code,
                timer.triggerKey,
                timer.type,
            ))
        ));
    }

    cleanupStaleCronKeys(activeCronKeys: ReadonlySet<string>): number {
        const staleKeys = [...this.lastCronKeyByPipeline.keys()]
            .filter(key => !activeCronKeys.has(key));
        for (const key of staleKeys) {
            this.lastCronKeyByPipeline.delete(key);
        }
        if (staleKeys.length > 0) {
            this.logger.debug('Cleaned up stale cron keys', {
                removedCount: staleKeys.length,
                stalePipelineCodes: staleKeys.join(','),
            });
        }
        return staleKeys.length;
    }

    clearCronKeyForPipeline(code: string): void {
        for (const key of this.lastCronKeyByPipeline.keys()) {
            if (key === code || key.startsWith(`${code}:`)) {
                this.lastCronKeyByPipeline.delete(key);
            }
        }
        this.logger.debug('Cleared cron keys for pipeline', { pipelineCode: code });
    }

    setupIntervalSchedule(
        pipeline: ActivePipelineDefinition,
        config: ScheduleTriggerConfig,
        triggerKey: string,
        signature: string,
        callbacks: ScheduleExecutionCallbacks,
    ): void {
        const intervalSec = Math.max(1, config.intervalSec ?? 1);
        const effectiveIntervalMs = this.getEffectiveIntervalMs(config);
        this.logger.debug('Scheduling interval pipeline', {
            pipelineCode: pipeline.code,
            triggerKey,
            intervalSec,
            effectiveIntervalMs,
        });

        const handle = setInterval(() => {
            const occurrence = getScheduleOccurrence(
                TIMER_TYPE.INTERVAL,
                Date.now(),
                effectiveIntervalMs,
            );
            this.scheduleExecution.triggerPipeline(
                pipeline,
                TIMER_TYPE.INTERVAL,
                triggerKey,
                occurrence,
                callbacks,
            ).catch(error => {
                this.logger.error(
                    'Interval schedule callback failed',
                    toErrorOrUndefined(error),
                    { pipelineCode: pipeline.code, triggerKey },
                );
            });
        }, effectiveIntervalMs);
        handle.unref();
        this.timers.push({
            code: pipeline.code,
            triggerKey,
            handle,
            type: TIMER_TYPE.INTERVAL,
            signature,
        });
    }

    setupCronSchedule(
        pipeline: ActivePipelineDefinition,
        config: ScheduleTriggerConfig,
        triggerKey: string,
        signature: string,
        callbacks: ScheduleExecutionCallbacks,
    ): boolean {
        const cronExpr = config.cron ?? '';
        const timezone = config.timezone ?? undefined;
        if (timezone && !isValidTimezone(timezone)) {
            this.logger.error(
                'Schedule trigger has an invalid timezone and was not activated',
                undefined,
                {
                    pipelineCode: pipeline.code,
                    triggerKey,
                    cronExpr,
                    invalidTimezone: timezone,
                },
            );
            return false;
        }
        this.logCronSchedule(pipeline.code, triggerKey, cronExpr, timezone);

        const cronTrackingKey = `${pipeline.code}:${triggerKey}`;
        const handle = setInterval(() => {
            this.handleCronTick(
                pipeline,
                triggerKey,
                cronExpr,
                timezone,
                cronTrackingKey,
                callbacks,
            ).catch(error => {
                this.logger.error('Cron schedule callback failed', toErrorOrUndefined(error), {
                    pipelineCode: pipeline.code,
                    triggerKey,
                    cronExpr,
                    timezone,
                });
            });
        }, this.config.checkIntervalMs);
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

    private removeTimers(predicate: (timer: ScheduledTimer) => boolean): void {
        for (let index = this.timers.length - 1; index >= 0; index--) {
            const timer = this.timers[index];
            if (!timer || !predicate(timer)) continue;
            clearInterval(timer.handle);
            this.timers.splice(index, 1);
        }
    }

    private async handleCronTick(
        pipeline: ActivePipelineDefinition,
        triggerKey: string,
        cronExpr: string,
        timezone: string | undefined,
        cronTrackingKey: string,
        callbacks: ScheduleExecutionCallbacks,
    ): Promise<void> {
        const now = new Date();
        if (!cronMatches(now, cronExpr, timezone)) return;

        const occurrence = getScheduleOccurrence(TIMER_TYPE.CRON, now.getTime());
        if (this.lastCronKeyByPipeline.get(cronTrackingKey) === occurrence.key) return;
        if (!this.recordCronMinute(cronTrackingKey, occurrence.key)) {
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
                    maxTrackingEntries: this.config.maxTrackingEntries,
                },
            );
            return;
        }
        await this.scheduleExecution.triggerPipeline(
            pipeline,
            TIMER_TYPE.CRON,
            triggerKey,
            occurrence,
            callbacks,
        );
    }

    private recordCronMinute(cronTrackingKey: string, minuteKey: string): boolean {
        if (
            !this.lastCronKeyByPipeline.has(cronTrackingKey)
            && this.lastCronKeyByPipeline.size >= this.config.maxTrackingEntries
        ) {
            return false;
        }
        this.lastCronKeyByPipeline.set(cronTrackingKey, minuteKey);
        return true;
    }

    private logCronSchedule(
        pipelineCode: string,
        triggerKey: string,
        cronExpr: string,
        timezone: string | undefined,
    ): void {
        this.logger.debug(
            timezone
                ? 'Scheduling cron pipeline with timezone'
                : 'Scheduling cron pipeline (server timezone)',
            {
                pipelineCode,
                triggerKey,
                cronExpr,
                timezone,
                checkIntervalMs: this.config.checkIntervalMs,
            },
        );
    }
}
