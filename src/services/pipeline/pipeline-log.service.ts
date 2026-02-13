import { Injectable } from '@nestjs/common';
import { ID, ListQueryBuilder, ListQueryOptions, PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { PipelineLog } from '../../entities/pipeline';
import { LogLevel, SortOrder } from '../../constants/enums';
import { Between, ILike, In, LessThan, MoreThan, Repository } from 'typeorm';
import { PAGINATION } from '../../constants/index';
import type { JsonObject } from '../../types/index';

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

    /**
     * List logs using Vendure's standard ListQueryOptions (filter, sort, pagination)
     */
    async list(ctx: RequestContext, options?: ListQueryOptions<PipelineLog>): Promise<PaginatedList<PipelineLog>> {
        return this.listQueryBuilder
            .build(PipelineLog, options ?? {}, {
                ctx,
                relations: ['pipeline'],
            })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
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
        if (entry.pipelineId) logEntry.pipelineId = Number(entry.pipelineId);
        if (entry.runId) logEntry.runId = Number(entry.runId);
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
        const where: Record<string, unknown> = {};

        if (options.pipelineId) {
            where.pipelineId = options.pipelineId;
        }
        if (options.runId) {
            where.runId = options.runId;
        }
        if (options.level) {
            where.level = Array.isArray(options.level) ? In(options.level) : options.level;
        }
        if (options.stepKey) {
            where.stepKey = options.stepKey;
        }
        if (options.search) {
            const escapedSearch = options.search.replace(/[%_\\]/g, '\\$&');
            where.message = ILike(`%${escapedSearch}%`);
        }
        if (options.startDate && options.endDate) {
            where.createdAt = Between(options.startDate, options.endDate);
        } else if (options.startDate) {
            where.createdAt = MoreThan(options.startDate);
        } else if (options.endDate) {
            where.createdAt = LessThan(options.endDate);
        }

        const [items, totalItems] = await repo.findAndCount({
            where,
            order: { createdAt: SortOrder.DESC },
            skip: options.skip ?? 0,
            take: options.take ?? PAGINATION.EVENTS_LIMIT,
            relations: ['pipeline', 'run'],
        });

        return { items, totalItems };
    }

    /**
     * Get logs for a specific run
     */
    async getRunLogs(ctx: RequestContext, runId: ID): Promise<PipelineLog[]> {
        const repo = this.connection.getRepository(ctx, PipelineLog);
        return repo.find({
            where: { runId: Number(runId) },
            order: { createdAt: SortOrder.ASC },
            take: PAGINATION.MAX_RUN_LOG_ENTRIES,
        });
    }

    /**
     * Get log statistics
     */
    async getStats(ctx: RequestContext, pipelineId?: ID): Promise<LogStats> {
        const repo = this.connection.getRepository(ctx, PipelineLog);

        const [{ total, byLevel }, { errorsToday, warningsToday }, avgDurationMs] = await Promise.all([
            this.fetchLogCounts(repo, pipelineId),
            this.fetchRecentErrorStats(repo, pipelineId),
            this.calculateAverageDuration(repo, pipelineId),
        ]);

        return this.buildStatsResult(total, byLevel, errorsToday, warningsToday, avgDurationMs);
    }

    /**
     * Fetch total count and counts by log level
     */
    private async fetchLogCounts(
        repo: Repository<PipelineLog>,
        pipelineId?: ID,
    ): Promise<{ total: number; byLevel: Record<LogLevel, number> }> {
        const whereClause = pipelineId ? 'log.pipelineId = :pipelineId' : '1=1';

        const [total, levelCounts] = await Promise.all([
            repo.createQueryBuilder('log').where(whereClause, { pipelineId }).getCount(),
            repo
                .createQueryBuilder('log')
                .select('log.level', 'level')
                .addSelect('COUNT(*)', 'count')
                .where(whereClause, { pipelineId })
                .groupBy('log.level')
                .getRawMany(),
        ]);

        const byLevel: Record<LogLevel, number> = {
            [LogLevel.DEBUG]: 0,
            [LogLevel.INFO]: 0,
            [LogLevel.WARN]: 0,
            [LogLevel.ERROR]: 0,
        };
        for (const lc of levelCounts) {
            byLevel[lc.level as LogLevel] = Number(lc.count);
        }

        return { total, byLevel };
    }

    /**
     * Fetch today's error and warning counts
     */
    private async fetchRecentErrorStats(
        repo: Repository<PipelineLog>,
        pipelineId?: ID,
    ): Promise<{ errorsToday: number; warningsToday: number }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const baseWhere: Record<string, unknown> = {
            createdAt: MoreThan(today),
        };
        if (pipelineId) {
            baseWhere.pipelineId = pipelineId;
        }

        const errorWhere = { ...baseWhere, level: LogLevel.ERROR };
        const warnWhere = { ...baseWhere, level: LogLevel.WARN };
        const [errorsToday, warningsToday] = await Promise.all([
            repo.count({ where: errorWhere }),
            repo.count({ where: warnWhere }),
        ]);

        return { errorsToday, warningsToday };
    }

    /**
     * Calculate average duration of logs with duration
     */
    private async calculateAverageDuration(
        repo: Repository<PipelineLog>,
        pipelineId?: ID,
    ): Promise<number> {
        const avgResult = await repo
            .createQueryBuilder('log')
            .select('AVG(log.durationMs)', 'avg')
            .where('log.durationMs IS NOT NULL')
            .andWhere(pipelineId ? 'log.pipelineId = :pipelineId' : '1=1', { pipelineId })
            .getRawOne();

        return Math.round(avgResult?.avg ?? 0);
    }

    /**
     * Build the final stats result object
     */
    private buildStatsResult(
        total: number,
        byLevel: Record<LogLevel, number>,
        errorsToday: number,
        warningsToday: number,
        avgDurationMs: number,
    ): LogStats {
        return {
            total,
            byLevel,
            errorsToday,
            warningsToday,
            avgDurationMs,
        };
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
        return repo.find({
            order: { createdAt: SortOrder.DESC },
            take: Math.min(limit, 1000),
            relations: ['pipeline'],
        });
    }
}
