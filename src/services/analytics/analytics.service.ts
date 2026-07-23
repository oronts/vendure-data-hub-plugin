/**
 * Analytics Service
 *
 * Analytics and metrics for pipeline runs and performance monitoring.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    TransactionalConnection,
    RequestContext,
    ID,
} from '@vendure/core';
import { MoreThan, In, FindOptionsWhere } from 'typeorm';
import { PipelineRun, Pipeline } from '../../entities/pipeline';
import { DataHubRecordError } from '../../entities/data';
import { RunStatus } from '../../types/index';
import { PAGINATION, TIME, LOGGER_CONTEXTS, SortOrder } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

import {
    TimeRange,
    TimeSeriesPoint,
    AnalyticsOverview,
    PipelinePerformance,
    ErrorAnalytics,
    ThroughputMetrics,
    RealTimeStats,
    RunHistoryItem,
} from './analytics.types';
import { getStartDate, calculateTimeSeries } from './time-series.helpers';
import { extractRunMetrics, groupErrorsByKey, getTopErrors } from './metrics.helpers';
import {
    aggregateRunStats,
    calculateSuccessRates,
    buildOverviewMetrics,
    getStartOfCalendarWeek,
} from './overview.helpers';
import {
    aggregatePipelineMetrics,
    buildPerformanceReport,
} from './performance.helpers';
import {
    calculateThroughputData,
    buildThroughputResult,
} from './throughput.helpers';

export type { TimeRange, TimeSeriesPoint, AnalyticsOverview, PipelinePerformance, ErrorAnalytics, ThroughputMetrics };

const ANALYTICS_PAGE_SIZE = PAGINATION.MAX_QUERY_LIMIT;

@Injectable()
export class AnalyticsService implements OnModuleInit {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ANALYTICS_SERVICE);
    }

    async onModuleInit() {
        this.logger.info('AnalyticsService initialized');
    }

    private async loadAllPages<T>(
        loadPage: (skip: number, take: number) => Promise<T[]>,
    ): Promise<T[]> {
        const rows: T[] = [];
        let skip = 0;
        let page: T[];
        do {
            page = await loadPage(skip, ANALYTICS_PAGE_SIZE);
            rows.push(...page);
            skip += page.length;
        } while (page.length === ANALYTICS_PAGE_SIZE);
        return rows;
    }

    /** Fetch all overview data from the database in parallel */
    private async fetchOverviewData(ctx: RequestContext, startOfDay: Date, startOfWeek: Date) {
        return Promise.all([
            this.connection.getRepository(ctx, Pipeline).count(),
            this.connection.getRepository(ctx, Pipeline).count({ where: { enabled: true } }),
            this.connection.getRepository(ctx, PipelineRun).count({ where: { createdAt: MoreThan(startOfDay) } }),
            this.connection.getRepository(ctx, PipelineRun).count({ where: { createdAt: MoreThan(startOfWeek) } }),
            this.loadAllPages((skip, take) =>
                this.connection.getRepository(ctx, PipelineRun).find({
                    where: { createdAt: MoreThan(startOfDay) },
                    select: ['id', 'status', 'metrics'],
                    order: { createdAt: SortOrder.DESC, id: SortOrder.DESC },
                    skip,
                    take,
                })),
            this.loadAllPages((skip, take) =>
                this.connection.getRepository(ctx, PipelineRun).find({
                    where: { createdAt: MoreThan(startOfWeek) },
                    select: ['id', 'status'],
                    order: { createdAt: SortOrder.DESC, id: SortOrder.DESC },
                    skip,
                    take,
                })),
        ]);
    }

    /** Get analytics overview */
    async getOverview(ctx: RequestContext): Promise<AnalyticsOverview> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const startOfWeek = getStartOfCalendarWeek();

        // Fetch all data in parallel
        const [totalPipelines, enabledPipelines, runsToday, runsThisWeek, todayRuns, weekRuns] =
            await this.fetchOverviewData(ctx, startOfDay, startOfWeek);

        // Aggregate run statistics and calculate success rates
        const runStats = aggregateRunStats(todayRuns, weekRuns);
        const successRates = calculateSuccessRates(
            runStats.successfulRunsToday,
            runStats.outcomeRunsToday,
            runStats.successfulRunsWeek,
            runStats.outcomeRunsWeek,
        );

        // Build and return the overview metrics
        return buildOverviewMetrics({
            totalPipelines,
            enabledPipelines,
            runsToday,
            runsThisWeek,
            recordsProcessedToday: runStats.recordsProcessedToday,
            recordsFailedToday: runStats.recordsFailedToday,
            successRateToday: successRates.successRateToday,
            successRateWeek: successRates.successRateWeek,
            durations: runStats.durations,
        });
    }

    /** Fetch pipelines based on optional ID filter */
    private async fetchPipelines(ctx: RequestContext, pipelineId?: ID, limit?: number): Promise<Pipeline[]> {
        if (pipelineId) {
            const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
                where: { id: pipelineId },
            });
            return pipeline ? [pipeline] : [];
        }
        return this.connection.getRepository(ctx, Pipeline).find({
            take: this.normalizeLimit(limit),
        });
    }

    private normalizeLimit(limit?: number): number {
        if (limit === undefined) return PAGINATION.LIST_PAGE_SIZE;
        if (!Number.isInteger(limit) || limit <= 0) {
            throw new Error('Analytics limit must be a positive integer');
        }
        return Math.min(limit, PAGINATION.MAX_QUERY_LIMIT);
    }

    /** Load all runs for given pipelines and group by pipeline ID */
    private async loadRunsByPipeline(
        ctx: RequestContext,
        pipelines: Pipeline[],
        startDate: Date,
    ): Promise<Map<string | number, PipelineRun[]>> {
        const pipelineIds = pipelines.map(p => p.id);
        const repository = this.connection.getRepository(ctx, PipelineRun);
        const allRuns = await this.loadAllPages((skip, take) => repository.find({
            where: {
                pipeline: { id: In(pipelineIds) },
                createdAt: MoreThan(startDate),
            },
            relations: ['pipeline'],
            select: {
                id: true,
                status: true,
                metrics: true,
                createdAt: true,
                pipeline: { id: true, code: true, name: true },
            },
            order: { createdAt: SortOrder.DESC, id: SortOrder.DESC },
            skip,
            take,
        }));

        const runsByPipelineId = new Map<string | number, PipelineRun[]>();
        for (const run of allRuns) {
            const id = run.pipeline?.id;
            if (id) {
                const existing = runsByPipelineId.get(id) || [];
                existing.push(run);
                runsByPipelineId.set(id, existing);
            }
        }
        return runsByPipelineId;
    }

    /** Get pipeline performance metrics */
    async getPipelinePerformance(
        ctx: RequestContext,
        options?: {
            pipelineId?: ID;
            timeRange?: TimeRange;
            limit?: number;
        },
    ): Promise<PipelinePerformance[]> {
        const startDate = getStartDate(options?.timeRange || '30d');

        // Fetch pipelines
        const pipelines = await this.fetchPipelines(ctx, options?.pipelineId, options?.limit);
        if (pipelines.length === 0) {
            return [];
        }

        // Batch load and group runs by pipeline
        const runsByPipelineId = await this.loadRunsByPipeline(ctx, pipelines, startDate);

        // Build performance reports for each pipeline
        const results = pipelines.map(pipeline => {
            const runs = runsByPipelineId.get(pipeline.id) || [];
            const aggregatedMetrics = aggregatePipelineMetrics(runs);
            return buildPerformanceReport(pipeline, runs, aggregatedMetrics);
        });

        // Sort by total runs descending
        return results.sort((a, b) => b.totalRuns - a.totalRuns);
    }

    /** Build where clause for error analytics query */
    private buildErrorWhereClause(startDate: Date, pipelineId?: ID): FindOptionsWhere<DataHubRecordError> {
        const whereClause: FindOptionsWhere<DataHubRecordError> = { createdAt: MoreThan(startDate) };
        if (pipelineId) {
            whereClause.run = { pipeline: { id: pipelineId } };
        }
        return whereClause;
    }

    /** Group errors and build analytics result */
    private buildErrorAnalyticsResult(
        errors: DataHubRecordError[],
        timeRange: TimeRange,
        totalErrors: number,
    ): ErrorAnalytics {
        // Group errors by step
        const errorsByStepMap = groupErrorsByKey(errors, error => error.stepKey);
        const errorsByStep = Object.entries(errorsByStepMap).map(([stepKey, count]) => ({
            stepKey,
            count,
        }));

        // Group errors by pipeline
        const errorsByPipelineMap = groupErrorsByKey(
            errors,
            error => error.run?.pipeline?.code || 'unknown',
        );
        const errorsByPipeline = Object.entries(errorsByPipelineMap).map(([pipelineCode, count]) => ({
            pipelineCode,
            count,
        }));

        // Get top errors and calculate trend
        const topErrors = getTopErrors(
            errors.map(e => ({ message: e.message, createdAt: e.createdAt })),
            PAGINATION.TOP_ERRORS_LIMIT,
        );
        const errorTrend = calculateTimeSeries(errors.map(e => e.createdAt), timeRange);

        return { totalErrors, errorsByStep, errorsByPipeline, topErrors, errorTrend };
    }

    /** Get error analytics */
    async getErrorAnalytics(
        ctx: RequestContext,
        options?: {
            pipelineId?: ID;
            timeRange?: TimeRange;
        },
    ): Promise<ErrorAnalytics> {
        const timeRange = options?.timeRange || '7d';
        const startDate = getStartDate(timeRange);
        const whereClause = this.buildErrorWhereClause(startDate, options?.pipelineId);

        const repository = this.connection.getRepository(ctx, DataHubRecordError);
        const [totalErrors, errors] = await Promise.all([
            repository.count({ where: whereClause }),
            this.loadAllPages((skip, take) => repository.find({
                where: whereClause,
                relations: ['run', 'run.pipeline'],
                select: {
                    id: true,
                    stepKey: true,
                    message: true,
                    createdAt: true,
                    run: {
                        id: true,
                        pipeline: { id: true, code: true },
                    },
                },
                order: { createdAt: SortOrder.DESC, id: SortOrder.DESC },
                skip,
                take,
            })),
        ]);

        return this.buildErrorAnalyticsResult(errors, timeRange, totalErrors);
    }

    /** Get throughput metrics */
    async getThroughputMetrics(
        ctx: RequestContext,
        options?: {
            pipelineId?: ID;
            timeRange?: TimeRange;
        },
    ): Promise<ThroughputMetrics> {
        const timeRange = options?.timeRange || '24h';
        const startDate = getStartDate(timeRange);
        const durationHours = (Date.now() - startDate.getTime()) / TIME.HOUR;

        const whereClause: FindOptionsWhere<PipelineRun> = { createdAt: MoreThan(startDate) };
        if (options?.pipelineId) {
            whereClause.pipeline = { id: options.pipelineId };
        }

        const repository = this.connection.getRepository(ctx, PipelineRun);
        const runs = await this.loadAllPages((skip, take) => repository.find({
            where: whereClause,
            select: ['id', 'metrics', 'createdAt', 'finishedAt'],
            order: { createdAt: SortOrder.DESC, id: SortOrder.DESC },
            skip,
            take,
        }));

        const throughputData = calculateThroughputData(runs);
        return buildThroughputResult(throughputData, durationHours, timeRange);
    }

    /** Build where clause for run history query */
    private buildRunHistoryWhereClause(options?: {
        pipelineId?: ID;
        status?: string;
        timeRange?: TimeRange;
    }): FindOptionsWhere<PipelineRun> {
        const whereClause: FindOptionsWhere<PipelineRun> = {};
        if (options?.pipelineId) {
            whereClause.pipeline = { id: options.pipelineId };
        }
        if (options?.status) {
            whereClause.status = options.status as RunStatus;
        }
        if (options?.timeRange) {
            whereClause.createdAt = MoreThan(getStartDate(options.timeRange));
        }
        return whereClause;
    }

    /** Map pipeline run to run history item */
    private mapRunToHistoryItem(run: PipelineRun): RunHistoryItem {
        const metrics = extractRunMetrics(run.metrics);
        return {
            id: run.id,
            pipelineId: run.pipeline?.id,
            pipelineCode: run.pipeline?.code,
            pipelineName: run.pipeline?.name,
            status: run.status,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            durationMs: metrics.durationMs,
            recordsProcessed: metrics.recordsProcessed,
            recordsFailed: metrics.recordsFailed,
            error: run.error,
        };
    }

    /** Get run history with pagination */
    async getRunHistory(
        ctx: RequestContext,
        options?: {
            pipelineId?: ID;
            status?: string;
            timeRange?: TimeRange;
            limit?: number;
            offset?: number;
        },
    ): Promise<{ runs: RunHistoryItem[]; totalItems: number }> {
        const whereClause = this.buildRunHistoryWhereClause(options);

        const [runs, totalItems] = await this.connection.getRepository(ctx, PipelineRun).findAndCount({
            where: whereClause,
            relations: ['pipeline'],
            order: { createdAt: SortOrder.DESC },
            take: this.normalizeLimit(options?.limit),
            skip: Math.max(0, options?.offset ?? 0),
        });

        return {
            runs: runs.map(run => this.mapRunToHistoryItem(run)),
            totalItems,
        };
    }

    /** Get real-time stats (for dashboard polling) */
    async getRealTimeStats(ctx: RequestContext): Promise<RealTimeStats> {
        const oneMinuteAgo = new Date(Date.now() - TIME.ONE_MINUTE_MS);
        const fiveMinutesAgo = new Date(Date.now() - TIME.FIVE_MINUTES_MS);

        const [activeRuns, queuedRuns, recentErrors, recentRuns] = await Promise.all([
            this.connection.getRepository(ctx, PipelineRun).count({
                where: { status: RunStatus.RUNNING },
            }),
            this.connection.getRepository(ctx, PipelineRun).count({
                where: { status: RunStatus.PENDING },
            }),
            this.connection.getRepository(ctx, DataHubRecordError).count({
                where: { createdAt: MoreThan(fiveMinutesAgo) },
            }),
            this.loadAllPages((skip, take) =>
                this.connection.getRepository(ctx, PipelineRun).find({
                    where: { finishedAt: MoreThan(oneMinuteAgo) },
                    select: ['id', 'metrics'],
                    order: { finishedAt: SortOrder.DESC, id: SortOrder.DESC },
                    skip,
                    take,
                })),
        ]);

        let recordsLastMinute = 0;
        for (const run of recentRuns) {
            recordsLastMinute += extractRunMetrics(run.metrics).recordsProcessed;
        }

        return {
            activeRuns,
            queuedRuns,
            recentErrors,
            recordsLastMinute,
        };
    }
}
