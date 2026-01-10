import { Injectable } from '@nestjs/common';
import { ID, ListQueryBuilder, ListQueryOptions, Logger, PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { PipelineLog, LogLevel } from '../../entities/pipeline';
import { Between, ILike, In, LessThan, MoreThan } from 'typeorm';
import { DEFAULTS, LOGGER_CTX } from '../../constants/index';

const loggerCtx = `${LOGGER_CTX}:Logs`;

export interface LogEntry {
    level: LogLevel;
    message: string;
    stepKey?: string;
    context?: Record<string, any>;
    metadata?: Record<string, any>;
    pipelineId?: ID;
    runId?: ID;
    durationMs?: number;
    recordsProcessed?: number;
    recordsFailed?: number;
}

export interface LogSearchOptions {
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
        const where: any = {};

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
            where.message = ILike(`%${options.search}%`);
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
            order: { createdAt: 'DESC' },
            skip: options.skip ?? 0,
            take: options.take ?? DEFAULTS.EVENTS_LIMIT,
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
            where: { runId } as any,
            order: { createdAt: 'ASC' },
        });
    }

    /**
     * Get log statistics
     */
    async getStats(ctx: RequestContext, pipelineId?: ID): Promise<LogStats> {
        const repo = this.connection.getRepository(ctx, PipelineLog);
        const qb = repo.createQueryBuilder('log');

        if (pipelineId) {
            qb.where('log.pipelineId = :pipelineId', { pipelineId });
        }

        const total = await qb.getCount();

        // Count by level
        const levelCounts = await repo
            .createQueryBuilder('log')
            .select('log.level', 'level')
            .addSelect('COUNT(*)', 'count')
            .where(pipelineId ? 'log.pipelineId = :pipelineId' : '1=1', { pipelineId })
            .groupBy('log.level')
            .getRawMany();

        const byLevel: Record<LogLevel, number> = {
            [LogLevel.DEBUG]: 0,
            [LogLevel.INFO]: 0,
            [LogLevel.WARN]: 0,
            [LogLevel.ERROR]: 0,
        };
        for (const lc of levelCounts) {
            byLevel[lc.level as LogLevel] = Number(lc.count);
        }

        // Today's errors and warnings
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const errorsToday = await repo.count({
            where: {
                level: LogLevel.ERROR,
                createdAt: MoreThan(today),
                ...(pipelineId ? { pipelineId } : {}),
            } as any,
        });

        const warningsToday = await repo.count({
            where: {
                level: LogLevel.WARN,
                createdAt: MoreThan(today),
                ...(pipelineId ? { pipelineId } : {}),
            } as any,
        });

        // Average duration
        const avgResult = await repo
            .createQueryBuilder('log')
            .select('AVG(log.durationMs)', 'avg')
            .where('log.durationMs IS NOT NULL')
            .andWhere(pipelineId ? 'log.pipelineId = :pipelineId' : '1=1', { pipelineId })
            .getRawOne();

        return {
            total,
            byLevel,
            errorsToday,
            warningsToday,
            avgDurationMs: Math.round(avgResult?.avg ?? 0),
        };
    }

    /**
     * Delete old logs (for retention)
     */
    async deleteOlderThan(ctx: RequestContext, date: Date): Promise<number> {
        const repo = this.connection.getRepository(ctx, PipelineLog);
        const result = await repo.delete({
            createdAt: LessThan(date),
        } as any);
        Logger.info(`Deleted ${result.affected} old log entries`, loggerCtx);
        return result.affected ?? 0;
    }

    /**
     * Get recent logs
     */
    async getRecent(ctx: RequestContext, limit: number = 100): Promise<PipelineLog[]> {
        const repo = this.connection.getRepository(ctx, PipelineLog);
        return repo.find({
            order: { createdAt: 'DESC' },
            take: limit,
            relations: ['pipeline'],
        });
    }
}
