import { Injectable, Optional } from '@nestjs/common';
import {
    ID,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import { LOGGER_CONTEXTS } from '../../constants/core';
import { RunStatus, TIMER_TYPE, TimerType } from '../../constants/enums';
import { PipelineRun } from '../../entities/pipeline';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { DataHubLoggerFactory } from '../../services/logger';
import type { DataHubLogger } from '../../services/logger';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { ActivePipelineDefinition } from '../../services/pipeline/active-pipeline-definitions';
import { PipelineRevisionMismatchError } from '../../services/pipeline/pipeline-policy';
import { DistributedLockService } from '../../services/runtime/distributed-lock.service';
import { RuntimeConfigService } from '../../services/runtime/runtime-config.service';
import { toErrorOrUndefined } from '../../utils/error.utils';
import { ActiveTaskSet } from '../../utils/async-operation-tracker';
import type { ScheduleOccurrence } from './schedule-trigger';

export interface ScheduleExecutionCallbacks {
    readonly refreshSchedules: () => Promise<void>;
    readonly removePipelineTimers: (pipelineCode: string) => void;
}

@Injectable()
export class ScheduledPipelineExecutionService {
    private readonly failureCountByPipeline = new Map<string, number>();
    private readonly logger: DataHubLogger;
    private readonly maxConsecutiveFailures: number;
    private readonly maxTrackingEntries: number;
    private readonly activeTasks = new ActiveTaskSet();
    private isDestroying = false;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        private readonly pipelineService: PipelineService,
        runtimeConfigService: RuntimeConfigService,
        private readonly domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private readonly distributedLock?: DistributedLockService,
    ) {
        const schedulerConfig = runtimeConfigService.getSchedulerConfig();
        this.maxConsecutiveFailures = schedulerConfig.maxConsecutiveFailures;
        this.maxTrackingEntries = schedulerConfig.maxTrackingEntries;
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SCHEDULE_HANDLER);
    }

    async destroy(): Promise<void> {
        this.isDestroying = true;
        await this.activeTasks.settle();
        this.failureCountByPipeline.clear();
    }

    getFailureCount(pipelineCode: string): number {
        return this.failureCountByPipeline.get(pipelineCode) ?? 0;
    }

    getTrackedFailureCount(): number {
        return this.failureCountByPipeline.size;
    }

    getMaxConsecutiveFailures(): number {
        return this.maxConsecutiveFailures;
    }

    isCircuitOpen(pipelineCode: string): boolean {
        return this.getFailureCount(pipelineCode) >= this.maxConsecutiveFailures;
    }

    cleanupStaleFailureCounts(activePipelineCodes: ReadonlySet<string>): number {
        const staleCodes = [...this.failureCountByPipeline.keys()]
            .filter(code => !activePipelineCodes.has(code));
        for (const code of staleCodes) {
            this.failureCountByPipeline.delete(code);
        }

        if (staleCodes.length > 0) {
            this.logger.debug('Cleaned up stale failure counts', {
                removedCount: staleCodes.length,
                stalePipelineCodes: staleCodes.join(','),
            });
        }
        return staleCodes.length;
    }

    triggerPipeline(
        pipeline: ActivePipelineDefinition,
        triggerType: Exclude<TimerType, typeof TIMER_TYPE.REFRESH>,
        triggerKey: string | undefined,
        occurrence: ScheduleOccurrence,
        callbacks: ScheduleExecutionCallbacks,
    ): Promise<void> {
        if (this.isDestroying) {
            this.logger.debug('Skipping pipeline trigger - module is being destroyed', {
                pipelineCode: pipeline.code,
            });
            return Promise.resolve();
        }

        return this.activeTasks.run(() => this.performTrigger(
            pipeline,
            triggerType,
            triggerKey,
            occurrence,
            callbacks,
        ));
    }

    private async performTrigger(
        pipeline: ActivePipelineDefinition,
        triggerType: Exclude<TimerType, typeof TIMER_TYPE.REFRESH>,
        triggerKey: string | undefined,
        occurrence: ScheduleOccurrence,
        callbacks: ScheduleExecutionCallbacks,
    ): Promise<void> {
        const lockKey = [
            'schedule-trigger',
            pipeline.id,
            triggerKey ?? 'default',
            occurrence.key,
        ].join(':');

        try {
            if (!await this.claimOccurrence(lockKey, pipeline.code, triggerKey, occurrence)) {
                return;
            }
            if (this.isDestroying) return;
            if (await this.isPipelineRunning(pipeline.id)) {
                this.logger.info(
                    'Skipping scheduled run - pipeline already has an active run',
                    { pipelineCode: pipeline.code, triggerType },
                );
                return;
            }
            if (this.isDestroying) return;

            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            this.logger.debug('Triggering scheduled pipeline run', {
                pipelineCode: pipeline.code,
                triggerType,
                currentFailureCount: this.getFailureCount(pipeline.code),
            });

            await this.pipelineService.startRun(ctx, pipeline.id, {
                skipPermissionCheck: true,
                triggeredBy: triggerKey ? `schedule:${triggerKey}` : 'schedule',
                expectedRevisionId: pipeline.revisionId,
            });
            this.domainEvents.publishTriggerFired(String(pipeline.id), 'SCHEDULE', {
                pipelineCode: pipeline.code,
                triggerType,
                triggerKey,
            });
            this.resetFailureAfterSuccess(pipeline.code);
        } catch (error) {
            await this.handleTriggerFailure(
                error,
                pipeline,
                triggerType,
                triggerKey,
                callbacks,
            );
        }
    }

    resetCircuitBreaker(code: string): void {
        const previousFailureCount = this.failureCountByPipeline.get(code);
        if (previousFailureCount === undefined) return;

        this.failureCountByPipeline.delete(code);
        this.logger.info('Circuit breaker reset for pipeline', {
            pipelineCode: code,
            previousFailureCount,
        });
    }

    resetAllCircuitBreakers(): void {
        const count = this.failureCountByPipeline.size;
        this.failureCountByPipeline.clear();
        if (count > 0) {
            this.logger.info('All circuit breakers reset', { pipelinesReset: count });
        }
    }

    getCircuitBreakerStatus(): Map<string, { failureCount: number; isPaused: boolean }> {
        return new Map(
            [...this.failureCountByPipeline.entries()].map(([code, failureCount]) => [
                code,
                {
                    failureCount,
                    isPaused: failureCount >= this.maxConsecutiveFailures,
                },
            ]),
        );
    }

    getPausedPipelineCount(): number {
        return [...this.failureCountByPipeline.values()]
            .filter(count => count >= this.maxConsecutiveFailures)
            .length;
    }

    private async claimOccurrence(
        lockKey: string,
        pipelineCode: string,
        triggerKey: string | undefined,
        occurrence: ScheduleOccurrence,
    ): Promise<boolean> {
        if (!this.distributedLock) return true;

        const result = await this.distributedLock.acquire(lockKey, {
            ttlMs: occurrence.leaseTtlMs,
            waitForLock: false,
        });
        if (result.acquired) return true;

        this.logger.debug(
            'Skipping scheduled trigger - another instance is handling it',
            { pipelineCode, triggerKey, currentOwner: result.currentOwner },
        );
        return false;
    }

    private async isPipelineRunning(pipelineId: ID): Promise<boolean> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const activeRun = await this.connection.getRepository(ctx, PipelineRun).findOne({
            where: {
                pipelineId,
                status: In([RunStatus.RUNNING, RunStatus.PENDING, RunStatus.PAUSED]),
            },
        });
        return Boolean(activeRun);
    }

    private resetFailureAfterSuccess(pipelineCode: string): void {
        if (!this.failureCountByPipeline.delete(pipelineCode)) return;
        this.logger.debug('Reset failure count after successful trigger', {
            pipelineCode,
        });
    }

    private async handleTriggerFailure(
        error: unknown,
        pipeline: ActivePipelineDefinition,
        triggerType: Exclude<TimerType, typeof TIMER_TYPE.REFRESH>,
        triggerKey: string | undefined,
        callbacks: ScheduleExecutionCallbacks,
    ): Promise<void> {
        if (this.isDestroying) return;
        if (error instanceof PipelineRevisionMismatchError) {
            callbacks.removePipelineTimers(pipeline.code);
            this.logger.info('Refreshing schedules after published revision changed', {
                pipelineCode: pipeline.code,
                triggerKey,
            });
            await callbacks.refreshSchedules();
            return;
        }

        const failureCount = this.getFailureCount(pipeline.code) + 1;
        if (!this.recordPipelineFailure(pipeline.code, failureCount)) {
            this.disableForTrackingCapacity(pipeline, callbacks);
            return;
        }

        const circuitOpen = failureCount >= this.maxConsecutiveFailures;
        this.logger.error('Failed to trigger scheduled pipeline', toErrorOrUndefined(error), {
            pipelineCode: pipeline.code,
            triggerType,
            consecutiveFailures: failureCount,
            willPauseSchedule: circuitOpen,
        });
        if (circuitOpen) {
            this.openCircuit(pipeline, failureCount, callbacks);
        }
    }

    private recordPipelineFailure(pipelineCode: string, failureCount: number): boolean {
        if (
            !this.failureCountByPipeline.has(pipelineCode)
            && this.failureCountByPipeline.size >= this.maxTrackingEntries
        ) {
            return false;
        }
        this.failureCountByPipeline.set(pipelineCode, failureCount);
        return true;
    }

    private disableForTrackingCapacity(
        pipeline: ActivePipelineDefinition,
        callbacks: ScheduleExecutionCallbacks,
    ): void {
        callbacks.removePipelineTimers(pipeline.code);
        this.logger.error(
            'Pipeline schedule disabled because its failures cannot be tracked safely',
            undefined,
            {
                pipelineCode: pipeline.code,
                maxTrackingEntries: this.maxTrackingEntries,
            },
        );
        this.domainEvents.publishScheduleDeactivated(
            String(pipeline.id),
            pipeline.code,
            'Scheduler failure tracking capacity exhausted',
        );
    }

    private openCircuit(
        pipeline: ActivePipelineDefinition,
        failureCount: number,
        callbacks: ScheduleExecutionCallbacks,
    ): void {
        callbacks.removePipelineTimers(pipeline.code);
        this.domainEvents.publishScheduleDeactivated(
            String(pipeline.id),
            pipeline.code,
            `Circuit breaker: ${failureCount} consecutive failures`,
        );
        this.logger.warn(
            'Pipeline schedule will be paused - exceeded max consecutive failures',
            {
                pipelineCode: pipeline.code,
                maxConsecutiveFailures: this.maxConsecutiveFailures,
            },
        );
    }
}
