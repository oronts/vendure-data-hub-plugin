import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import {
    ID,
    ProcessContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { ObjectLiteral, Repository } from 'typeorm';
import { DATAHUB_PLUGIN_OPTIONS, TIME, LOGGER_CONTEXTS, SCHEDULER, RETENTION } from '../../constants/index';
import { RunStatus } from '../../constants/enums';
import { DataHubPluginOptions } from '../../types/index';
import {
    CLEARED_PIPELINE_RUN_GATE_STATE,
    DataHubEventTriggerOutbox,
    EventTriggerOutboxStatus,
    PipelineLog,
    PipelineRun,
} from '../../entities/pipeline';
import { DataHubRecordError } from '../../entities/data';
import { DataHubSettingsService } from '../config/settings.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { getErrorMessage, ensureError } from '../../utils/error.utils';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { normalizeRetentionDays } from './retention-policy';

interface RetentionBatchResult {
    affected: number;
    reachedLimit: boolean;
}

interface RetentionDeleteOptions {
    alias: string;
    timestampColumn: string;
    cutoff: Date;
    additionalWhere?: {
        expression: string;
        parameters: Record<string, unknown>;
    };
}

@Injectable()
export class DataHubRetentionService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private handle: ReturnType<typeof setInterval> | null = null;
    private purgeInProgress = false;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private settings: DataHubSettingsService,
        private processContext: ProcessContext,
        private distributedLock: DistributedLockService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.RETENTION_SERVICE);
    }

    async onModuleInit(): Promise<void> {
        normalizeRetentionDays('retentionDaysRuns', this.options.retentionDaysRuns);
        normalizeRetentionDays('retentionDaysErrors', this.options.retentionDaysErrors);

        if (!this.processContext.isServer) {
            this.logger.debug('Retention service disabled outside the server process');
            return;
        }

        this.logger.info('Retention service initialized', {
            purgeIntervalMs: SCHEDULER.RETENTION_PURGE_INTERVAL_MS,
            batchSize: RETENTION.PURGE_BATCH_SIZE,
            maxRowsPerEntity: RETENTION.MAX_ROWS_PER_ENTITY_PER_PURGE,
        });

        this.handle = setInterval(() => this.runPurgeCycle().catch(err => {
            this.logger.error('Scheduled retention purge failed', ensureError(err));
        }), SCHEDULER.RETENTION_PURGE_INTERVAL_MS);
        this.handle.unref();

        this.logger.debug('Running initial retention purge on startup');
        await this.runPurgeCycle().catch(err => {
            this.logger.warn('Initial retention purge failed', {
                error: getErrorMessage(err),
            });
        });
    }

    async onModuleDestroy(): Promise<void> {
        if (this.handle) {
            clearInterval(this.handle);
            this.handle = null;
            this.logger.debug('Retention service interval cleared');
        }
    }

    private async runPurgeCycle(): Promise<void> {
        if (this.purgeInProgress) {
            this.logger.debug('Skipping overlapping retention purge');
            return;
        }

        this.purgeInProgress = true;
        let lockToken: string | undefined;
        try {
            const lock = await this.distributedLock.acquire(RETENTION.PURGE_LOCK_KEY, {
                ttlMs: SCHEDULER.RETENTION_PURGE_LOCK_TTL_MS,
            });
            if (!lock.acquired || !lock.token) {
                this.logger.debug('Skipping retention purge because another instance owns the lease');
                return;
            }
            lockToken = lock.token;
            await this.purge();
        } finally {
            if (lockToken) {
                await this.distributedLock.release(RETENTION.PURGE_LOCK_KEY, lockToken)
                    .catch(error => this.logger.warn('Failed to release retention purge lease', {
                        error: getErrorMessage(error),
                    }));
            }
            this.purgeInProgress = false;
        }
    }

    private async purge(): Promise<void> {
        const startTime = Date.now();
        const db = await this.settings.get();
        const daysRuns = normalizeRetentionDays(
            'retentionDaysRuns',
            (db.retentionDaysRuns ?? this.options.retentionDaysRuns) ?? RETENTION.RUNS_DAYS,
        );
        const daysErrors = normalizeRetentionDays(
            'retentionDaysErrors',
            (db.retentionDaysErrors ?? this.options.retentionDaysErrors) ?? RETENTION.ERRORS_DAYS,
        );
        const daysLogs = normalizeRetentionDays(
            'retentionDaysLogs',
            db.retentionDaysLogs ?? 0,
        );
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const now = new Date();

        let runsDeleted = 0;
        let errorsDeleted = 0;
        let logsDeleted = 0;
        let eventDeliveriesDeleted = 0;

        const staleRunCutoff = new Date(now.getTime() - TIME.MAX_RUN_DURATION_MS);
        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const staleRunResult = await this.timeoutStaleRuns(runRepo, staleRunCutoff, now);
        if (staleRunResult.affected > 0) {
            this.logger.info('Cleaned up stale RUNNING runs', {
                count: staleRunResult.affected,
            });
        }
        if (staleRunResult.reachedLimit) {
            this.logRetentionLimit('stale pipeline runs');
        }

        if (daysRuns > 0) {
            const cutoff = new Date(now.getTime() - daysRuns * TIME.DAY);
            this.logger.debug('Purging old pipeline runs', {
                retentionDays: daysRuns,
                cutoffDate: cutoff.toISOString(),
            });
            const runResult = await this.deleteOlderThan(runRepo, {
                alias: 'pipelineRun',
                timestampColumn: 'finishedAt',
                cutoff,
                additionalWhere: {
                    expression: 'pipelineRun.finishedAt IS NOT NULL',
                    parameters: {},
                },
            });
            runsDeleted = runResult.affected;
            if (runResult.reachedLimit) this.logRetentionLimit('pipeline runs');

            const outboxResult = await this.deleteOlderThan(
                this.connection.getRepository(ctx, DataHubEventTriggerOutbox),
                {
                    alias: 'eventDelivery',
                    timestampColumn: 'deliveredAt',
                    cutoff,
                    additionalWhere: {
                        expression: 'eventDelivery.status = :status AND eventDelivery.deliveredAt IS NOT NULL',
                        parameters: { status: EventTriggerOutboxStatus.DELIVERED },
                    },
                },
            );
            const failedOutboxResult = await this.deleteOlderThan(
                this.connection.getRepository(ctx, DataHubEventTriggerOutbox),
                {
                    alias: 'eventDelivery',
                    timestampColumn: 'failedAt',
                    cutoff,
                    additionalWhere: {
                        expression: 'eventDelivery.status = :status AND eventDelivery.failedAt IS NOT NULL',
                        parameters: { status: EventTriggerOutboxStatus.FAILED },
                    },
                },
            );
            eventDeliveriesDeleted = outboxResult.affected + failedOutboxResult.affected;
            if (outboxResult.reachedLimit) this.logRetentionLimit('event deliveries');
            if (failedOutboxResult.reachedLimit) {
                this.logRetentionLimit('failed event deliveries');
            }
        }

        if (daysErrors > 0) {
            const cutoff = new Date(now.getTime() - daysErrors * TIME.DAY);
            this.logger.debug('Purging old record errors', {
                retentionDays: daysErrors,
                cutoffDate: cutoff.toISOString(),
            });
            const result = await this.deleteOlderThan(
                this.connection.getRepository(ctx, DataHubRecordError),
                { alias: 'recordError', timestampColumn: 'createdAt', cutoff },
            );
            errorsDeleted = result.affected;
            if (result.reachedLimit) this.logRetentionLimit('record errors');
        }

        if (daysLogs > 0) {
            const cutoff = new Date(now.getTime() - daysLogs * TIME.DAY);
            this.logger.debug('Purging old pipeline logs', {
                retentionDays: daysLogs,
                cutoffDate: cutoff.toISOString(),
            });
            const result = await this.deleteOlderThan(
                this.connection.getRepository(ctx, PipelineLog),
                { alias: 'pipelineLog', timestampColumn: 'createdAt', cutoff },
            );
            logsDeleted = result.affected;
            if (result.reachedLimit) this.logRetentionLimit('pipeline logs');
        }

        const durationMs = Date.now() - startTime;

        if (runsDeleted > 0 || errorsDeleted > 0 || logsDeleted > 0 || eventDeliveriesDeleted > 0) {
            this.logger.info('Retention purge completed', {
                runsDeleted,
                errorsDeleted,
                logsDeleted,
                eventDeliveriesDeleted,
                durationMs,
            });
        } else {
            this.logger.debug('Retention purge completed - no records to delete', { durationMs });
        }
    }

    private async timeoutStaleRuns(
        repository: Repository<PipelineRun>,
        cutoff: Date,
        now: Date,
    ): Promise<RetentionBatchResult> {
        let affected = 0;
        let processed = 0;

        while (processed < RETENTION.MAX_ROWS_PER_ENTITY_PER_PURGE) {
            const ids = await repository
                .createQueryBuilder('staleRun')
                .select('staleRun.id', 'id')
                .where('staleRun.status = :status', { status: RunStatus.RUNNING })
                .andWhere('staleRun.startedAt IS NOT NULL AND staleRun.startedAt < :cutoff', {
                    cutoff: cutoff.toISOString(),
                })
                .orderBy('staleRun.startedAt', 'ASC')
                .addOrderBy('staleRun.id', 'ASC')
                .take(this.nextBatchSize(processed))
                .getRawMany<{ id: ID }>();
            if (ids.length === 0) break;

            const result = await repository
                .createQueryBuilder()
                .update()
                .set({
                    status: RunStatus.TIMEOUT,
                    finishedAt: now,
                    error: `Run timed out (exceeded maximum duration of ${TIME.MAX_RUN_DURATION_MS / TIME.MINUTE} minutes)`,
                    ...CLEARED_PIPELINE_RUN_GATE_STATE,
                })
                .whereInIds(ids.map(row => row.id))
                .execute();
            const batchAffected = result.affected ?? 0;
            affected += batchAffected;
            processed += ids.length;
            if (batchAffected === 0 || ids.length < RETENTION.PURGE_BATCH_SIZE) break;
        }

        return {
            affected,
            reachedLimit: processed >= RETENTION.MAX_ROWS_PER_ENTITY_PER_PURGE,
        };
    }

    private async deleteOlderThan<T extends ObjectLiteral>(
        repository: Repository<T>,
        options: RetentionDeleteOptions,
    ): Promise<RetentionBatchResult> {
        let affected = 0;
        let processed = 0;

        while (processed < RETENTION.MAX_ROWS_PER_ENTITY_PER_PURGE) {
            const query = repository
                .createQueryBuilder(options.alias)
                .select(`${options.alias}.id`, 'id')
                .where(`${options.alias}.${options.timestampColumn} < :cutoff`, {
                    cutoff: options.cutoff.toISOString(),
                });
            if (options.additionalWhere) {
                query.andWhere(
                    options.additionalWhere.expression,
                    options.additionalWhere.parameters,
                );
            }
            const ids = await query
                .orderBy(`${options.alias}.${options.timestampColumn}`, 'ASC')
                .addOrderBy(`${options.alias}.id`, 'ASC')
                .take(this.nextBatchSize(processed))
                .getRawMany<{ id: ID }>();
            if (ids.length === 0) break;

            const result = await repository
                .createQueryBuilder()
                .delete()
                .whereInIds(ids.map(row => row.id))
                .execute();
            const batchAffected = result.affected ?? 0;
            affected += batchAffected;
            processed += ids.length;
            if (batchAffected === 0 || ids.length < RETENTION.PURGE_BATCH_SIZE) break;
        }

        return {
            affected,
            reachedLimit: processed >= RETENTION.MAX_ROWS_PER_ENTITY_PER_PURGE,
        };
    }

    private nextBatchSize(processed: number): number {
        return Math.min(
            RETENTION.PURGE_BATCH_SIZE,
            RETENTION.MAX_ROWS_PER_ENTITY_PER_PURGE - processed,
        );
    }

    private logRetentionLimit(entity: string): void {
        this.logger.warn('Retention purge reached the per-entity processing limit', {
            entity,
            maxRows: RETENTION.MAX_ROWS_PER_ENTITY_PER_PURGE,
        });
    }
}
