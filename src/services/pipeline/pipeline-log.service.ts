import { Injectable } from '@nestjs/common';
import { ID, ListQueryBuilder, ListQueryOptions, PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { PipelineLog } from '../../entities/pipeline';
import { LogLevel, SortOrder } from '../../constants/enums';
import { Brackets, ILike, LessThan, Repository, SelectQueryBuilder } from 'typeorm';
import { PAGINATION } from '../../constants/index';
import { escapeLikePattern } from '../../utils/sql-security.utils';
import type { JsonObject } from '../../types/index';
import { getActivePipelineRunChannelId } from './pipeline-run-channel';

export interface LogEntry {
    level: LogLevel;
    message: string;
    stepKey?: string;
    context?: JsonObject;
    metadata?: JsonObject;
    pipelineId?: ID;
    runId?: ID;
    durationMs?: number;
    recordsProcessed?: number;
    recordsFailed?: number;
}

interface LogSearchOptions {
    pipelineId?: ID;
    runId?: ID;
    level?: LogLevel | LogLevel[];
    stepKey?: string;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    skip?: number;
    take?: number;
}

export interface LogStats {
    total: number;
    byLevel: Record<LogLevel, number>;
    errorsToday: number;
    warningsToday: number;
    avgDurationMs: number;
}

@Injectable()
export class PipelineLogService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}
    private scopeToActiveChannel(
        ctx: RequestContext,
        query: SelectQueryBuilder<PipelineLog>,
    ): SelectQueryBuilder<PipelineLog> {
        const alias = query.alias;
        const runAlias = alias + '_channel_run';
        const pipelineAlias = alias + '_channel_pipeline';
        const channelAlias = alias + '_active_channel';
        const channelId = getActivePipelineRunChannelId(ctx);
        query
            .leftJoin(alias + '.run', runAlias)
            .leftJoin(alias + '.pipeline', pipelineAlias)
            .leftJoin(
                pipelineAlias + '.channels',
                channelAlias,
                channelAlias + '.id = :activePipelineChannelId',
                { activePipelineChannelId: ctx.channelId },
            )
            .andWhere(new Brackets(where => {
                where
                    .where(runAlias + '.channelId = :activeRunChannelId', {
                        activeRunChannelId: channelId,
                    })
                    .orWhere(
                        '(' + alias + '.runId IS NULL AND '
                        + channelAlias + '.id IS NOT NULL)',
                    );
            }));
        return query;
    }
    private createScopedQuery(
        ctx: RequestContext,
        repo: Repository<PipelineLog>,
        pipelineId?: ID,
    ): SelectQueryBuilder<PipelineLog> {
        const query = this.scopeToActiveChannel(ctx, repo.createQueryBuilder('log'));
        if (pipelineId !== undefined) {
            query.andWhere('log.pipelineId = :pipelineId', { pipelineId });
        }
        return query;
    }


    /**
     * List logs using Vendure's standard ListQueryOptions (filter, sort, pagination)
     */
    async list(ctx: RequestContext, options?: ListQueryOptions<PipelineLog>): Promise<PaginatedList<PipelineLog>> {
        const query = this.listQueryBuilder.build(PipelineLog, options ?? {}, {
            ctx,
            relations: ['pipeline'],
        });
        const [items, totalItems] = await this.scopeToActiveChannel(
            ctx,
            query,
        ).getManyAndCount();
        return { items, totalItems };
    }

    /**
     * Create a log entry
     */
    async log(ctx: RequestContext, entry: LogEntry): Promise<PipelineLog> {
        const repo = this.connection.getRepository(ctx, PipelineLog);
        const logEntry = new PipelineLog();
        logEntry.level = entry.level;
        logEntry.message = entry.message;
        if (entry.stepKey) logEntry.stepKey = entry.stepKey;
        if (entry.context) logEntry.context = entry.context;
        if (entry.metadata) logEntry.metadata = entry.metadata;
        if (entry.pipelineId) logEntry.pipelineId = entry.pipelineId;
        if (entry.runId) logEntry.runId = entry.runId;
        if (entry.durationMs !== undefined) logEntry.durationMs = entry.durationMs;
        if (entry.recordsProcessed !== undefined) logEntry.recordsProcessed = entry.recordsProcessed;
        if (entry.recordsFailed !== undefined) logEntry.recordsFailed = entry.recordsFailed;
        return repo.save(logEntry);
    }

    /**
     * Convenience methods for different log levels
     */
    async debug(ctx: RequestContext, message: string, entry?: Omit<LogEntry, 'level' | 'message'>): Promise<PipelineLog> {
        return this.log(ctx, { ...entry, level: LogLevel.DEBUG, message });
    }

    async info(ctx: RequestContext, message: string, entry?: Omit<LogEntry, 'level' | 'message'>): Promise<PipelineLog> {
        return this.log(ctx, { ...entry, level: LogLevel.INFO, message });
    }

    async warn(ctx: RequestContext, message: string, entry?: Omit<LogEntry, 'level' | 'message'>): Promise<PipelineLog> {
        return this.log(ctx, { ...entry, level: LogLevel.WARN, message });
    }

    async error(ctx: RequestContext, message: string, entry?: Omit<LogEntry, 'level' | 'message'>): Promise<PipelineLog> {
        return this.log(ctx, { ...entry, level: LogLevel.ERROR, message });
    }

    /**
     * Search logs with filters
     */
    async search(ctx: RequestContext, options: LogSearchOptions): Promise<{ items: PipelineLog[]; totalItems: number }> {
        const repo = this.connection.getRepository(ctx, PipelineLog);
        const query = this.scopeToActiveChannel(
            ctx,
            repo.createQueryBuilder('log'),
        )
            .leftJoinAndSelect('log.pipeline', 'pipeline')
            .leftJoinAndSelect('log.run', 'run');

        if (options.pipelineId) {
            query.andWhere('log.pipelineId = :searchPipelineId', {
                searchPipelineId: options.pipelineId,
            });
        }
        if (options.runId) {
            query.andWhere('log.runId = :searchRunId', { searchRunId: options.runId });
        }
        if (options.level) {
            const levels = Array.isArray(options.level) ? options.level : [options.level];
            if (levels.length === 0) return { items: [], totalItems: 0 };
            query.andWhere('log.level IN (:...searchLevels)', { searchLevels: levels });
        }
        if (options.stepKey) {
            query.andWhere('log.stepKey = :searchStepKey', {
                searchStepKey: options.stepKey,
            });
        }
        if (options.search) {
            query.andWhere({
                message: ILike(`%${escapeLikePattern(options.search)}%`),
            });
        }
        if (options.startDate && options.endDate) {
            query.andWhere('log.createdAt BETWEEN :startDate AND :endDate', {
                startDate: options.startDate,
                endDate: options.endDate,
            });
        } else if (options.startDate) {
            query.andWhere('log.createdAt > :startDate', { startDate: options.startDate });
        } else if (options.endDate) {
            query.andWhere('log.createdAt < :endDate', { endDate: options.endDate });
        }

        const skip = Number.isSafeInteger(options.skip) && (options.skip ?? 0) >= 0
            ? options.skip ?? 0
            : 0;
        const take = Number.isSafeInteger(options.take) && (options.take ?? 0) > 0
            ? Math.min(options.take ?? PAGINATION.EVENTS_LIMIT, PAGINATION.MAX_QUERY_LIMIT)
            : PAGINATION.EVENTS_LIMIT;
        const [items, totalItems] = await query
            .orderBy('log.createdAt', SortOrder.DESC)
            .skip(skip)
            .take(take)
            .getManyAndCount();

        return { items, totalItems };
    }

    /**
     * Get logs for a specific run
     */
    async getRunLogs(ctx: RequestContext, runId: ID): Promise<PipelineLog[]> {
        const repo = this.connection.getRepository(ctx, PipelineLog);
        const channelId = getActivePipelineRunChannelId(ctx);
        return repo.find({
            where: { runId, run: { channelId } },
            order: { createdAt: SortOrder.ASC },
            take: PAGINATION.MAX_RUN_LOG_ENTRIES,
            relations: { pipeline: true, run: true },
        });
    }

    /**
     * Get log statistics
     */
    async getStats(ctx: RequestContext, pipelineId?: ID): Promise<LogStats> {
        const repo = this.connection.getRepository(ctx, PipelineLog);

        const [{ total, byLevel }, { errorsToday, warningsToday }, avgDurationMs] = await Promise.all([
            this.fetchLogCounts(ctx, repo, pipelineId),
            this.fetchRecentErrorStats(ctx, repo, pipelineId),
            this.calculateAverageDuration(ctx, repo, pipelineId),
        ]);

        return { total, byLevel, errorsToday, warningsToday, avgDurationMs };
    }

    /**
     * Fetch total count and counts by log level
     */
    private async fetchLogCounts(
        ctx: RequestContext,
        repo: Repository<PipelineLog>,
        pipelineId?: ID,
    ): Promise<{ total: number; byLevel: Record<LogLevel, number> }> {
        const totalQuery = this.createScopedQuery(ctx, repo, pipelineId);
        const levelQuery = this.createScopedQuery(ctx, repo, pipelineId)
            .select('log.level', 'level')
            .addSelect('COUNT(*)', 'count')
            .groupBy('log.level');
        const [total, levelCounts] = await Promise.all([
            totalQuery.getCount(),
            levelQuery.getRawMany<{ level: LogLevel; count: string }>(),
        ]);

        const byLevel: Record<LogLevel, number> = {
            [LogLevel.DEBUG]: 0,
            [LogLevel.INFO]: 0,
            [LogLevel.WARN]: 0,
            [LogLevel.ERROR]: 0,
        };
        for (const levelCount of levelCounts) {
            byLevel[levelCount.level] = Number(levelCount.count);
        }

        return { total, byLevel };
    }

    /**
     * Fetch today's error and warning counts
     */
    private async fetchRecentErrorStats(
        ctx: RequestContext,
        repo: Repository<PipelineLog>,
        pipelineId?: ID,
    ): Promise<{ errorsToday: number; warningsToday: number }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const createLevelQuery = (level: LogLevel) => (
            this.createScopedQuery(ctx, repo, pipelineId)
                .andWhere('log.createdAt > :today', { today })
                .andWhere('log.level = :level', { level })
        );
        const [errorsToday, warningsToday] = await Promise.all([
            createLevelQuery(LogLevel.ERROR).getCount(),
            createLevelQuery(LogLevel.WARN).getCount(),
        ]);

        return { errorsToday, warningsToday };
    }

    /**
     * Calculate average duration of logs with duration
     */
    private async calculateAverageDuration(
        ctx: RequestContext,
        repo: Repository<PipelineLog>,
        pipelineId?: ID,
    ): Promise<number> {
        const avgResult = await this.createScopedQuery(ctx, repo, pipelineId)
            .select('AVG(log.durationMs)', 'avg')
            .andWhere('log.durationMs IS NOT NULL')
            .getRawOne<{ avg: number | string | null }>();

        return Math.round(Number(avgResult?.avg ?? 0));
    }

    /**
     * Delete old logs (for retention)
     */
    async deleteOlderThan(ctx: RequestContext, date: Date): Promise<number> {
        const repo = this.connection.getRepository(ctx, PipelineLog);
        const result = await repo.delete({
            createdAt: LessThan(date),
        });
        // Log message omitted as service-level logger is not available
        return result.affected ?? 0;
    }

    /**
     * Get recent logs
     */
    async getRecent(ctx: RequestContext, limit: number = PAGINATION.RECENT_LOGS_LIMIT): Promise<PipelineLog[]> {
        const repo = this.connection.getRepository(ctx, PipelineLog);
        const safeLimit = Number.isSafeInteger(limit) && limit > 0
            ? Math.min(limit, PAGINATION.MAX_RECENT_LOGS)
            : PAGINATION.RECENT_LOGS_LIMIT;
        return this.createScopedQuery(ctx, repo)
            .leftJoinAndSelect('log.pipeline', 'pipeline')
            .leftJoinAndSelect('log.run', 'run')
            .orderBy('log.createdAt', SortOrder.DESC)
            .take(safeLimit)
            .getMany();
    }
}
