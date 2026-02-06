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
import { RunStatus, PipelineMetrics } from '../../types/index';
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
    ThroughputDataPoint,
} from './analytics.types';
import {
    getStartDate,
    calculateTimeSeries,
    calculateThroughputTimeSeries,
} from './time-series.helpers';
import {
    percentile,
    calculateSuccessRate,
    calculateAverage,
    extractRunMetrics,
    calculateThroughputRates,
    groupErrorsByKey,
    getTopErrors,
} from './metrics.helpers';

export type { TimeRange, TimeSeriesPoint, AnalyticsOverview, PipelinePerformance, ErrorAnalytics, ThroughputMetrics };

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

    // ─────────────────────────────────────────────────────────────────────────────
    // Private helper methods for getOverview
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Aggregate run statistics from pipeline runs
     */
    private aggregateRunStats(
        todayRuns: Array<{ status: RunStatus; metrics: PipelineMetrics | null }>,
        weekRuns: Array<{ status: RunStatus }>,
    ): {
        recordsProcessedToday: number;
        recordsFailedToday: number;
        successfulRunsToday: number;
        successfulRunsWeek: number;
        durations: number[];
    } {
        let recordsProcessedToday = 0;
        let recordsFailedToday = 0;
        let successfulRunsToday = 0;
        let successfulRunsWeek = 0;
        const durations: number[] = [];

        for (const run of todayRuns) {
            const metrics = extractRunMetrics(run.metrics);
            recordsProcessedToday += metrics.recordsProcessed;
            recordsFailedToday += metrics.recordsFailed;
            if (metrics.durationMs) {
                durations.push(metrics.durationMs);
            }
            if (run.status === RunStatus.COMPLETED) {
                successfulRunsToday++;
            }
        }

        for (const run of weekRuns) {
            if (run.status === RunStatus.COMPLETED) {
                successfulRunsWeek++;
            }
        }

        return {
            recordsProcessedToday,
            recordsFailedToday,
            successfulRunsToday,
            successfulRunsWeek,
            durations,
        };
    }

    /**
     * Calculate success rates for today and this week
     */
    private calculateSuccessRates(
        successfulRunsToday: number,
        totalRunsToday: number,
        successfulRunsWeek: number,
        totalRunsWeek: number,
    ): { successRateToday: number; successRateWeek: number } {
        return {
            successRateToday: calculateSuccessRate(successfulRunsToday, totalRunsToday),
            successRateWeek: calculateSuccessRate(successfulRunsWeek, totalRunsWeek),
        };
    }

    /**
     * Build the final overview metrics object
     */
    private buildOverviewMetrics(params: {
        totalPipelines: number;
        activePipelines: number;
        runsToday: number;
        runsThisWeek: number;
        activeJobs: number;
        recordsProcessedToday: number;
        recordsFailedToday: number;
        successRateToday: number;
        successRateWeek: number;
        durations: number[];
    }): AnalyticsOverview {
        return {
            totalPipelines: params.totalPipelines,
            activePipelines: params.activePipelines,
            totalJobs: params.runsToday,
            activeJobs: params.activeJobs,
            runsToday: params.runsToday,
            runsThisWeek: params.runsThisWeek,
            successRateToday: params.successRateToday,
            successRateWeek: params.successRateWeek,
            recordsProcessedToday: params.recordsProcessedToday,
            recordsFailedToday: params.recordsFailedToday,
            avgDurationMsToday: calculateAverage(params.durations),
        };
    }

    /**
     * Fetch all overview data from the database in parallel
     */
    private async fetchOverviewData(startOfDay: Date, startOfWeek: Date) {
        return Promise.all([
            this.connection.rawConnection.getRepository(Pipeline).count(),
            this.connection.rawConnection.getRepository(Pipeline).count({ where: { enabled: true } }),
            this.connection.rawConnection.getRepository(PipelineRun).count({ where: { createdAt: MoreThan(startOfDay) } }),
            this.connection.rawConnection.getRepository(PipelineRun).count({ where: { createdAt: MoreThan(startOfWeek) } }),
            this.connection.rawConnection.getRepository(PipelineRun).find({
                where: { createdAt: MoreThan(startOfDay) },
                select: ['status', 'metrics'],
            }),
            this.connection.rawConnection.getRepository(PipelineRun).find({
                where: { createdAt: MoreThan(startOfWeek) },
                select: ['status'],
            }),
            this.connection.rawConnection.getRepository(PipelineRun).count({
                where: [{ status: RunStatus.RUNNING }, { status: RunStatus.PENDING }],
            }),
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Private helper methods for getPipelinePerformance
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Aggregate metrics for pipeline runs
     */
    private aggregatePipelineMetrics(runs: PipelineRun[]): {
        durations: number[];
        totalRecordsProcessed: number;
        totalRecordsFailed: number;
        successfulRuns: number;
    } {
        const durations: number[] = [];
        let totalRecordsProcessed = 0;
        let totalRecordsFailed = 0;
        let successfulRuns = 0;

        for (const run of runs) {
            const metrics = extractRunMetrics(run.metrics);
            if (metrics.durationMs) {
                durations.push(metrics.durationMs);
            }
            totalRecordsProcessed += metrics.recordsProcessed;
            totalRecordsFailed += metrics.recordsFailed;
            if (run.status === RunStatus.COMPLETED) {
                successfulRuns++;
            }
        }

        return { durations, totalRecordsProcessed, totalRecordsFailed, successfulRuns };
    }

    /**
     * Calculate performance trends (percentiles) from durations
     */
    private calculatePerformanceTrends(durations: number[]): {
        avgDurationMs: number;
        p50DurationMs: number;
        p95DurationMs: number;
        p99DurationMs: number;
    } {
        // Sort durations for percentile calculations
        const sortedDurations = [...durations].sort((a, b) => a - b);
        return {
            avgDurationMs: calculateAverage(sortedDurations),
            p50DurationMs: percentile(sortedDurations, 50),
            p95DurationMs: percentile(sortedDurations, 95),
            p99DurationMs: percentile(sortedDurations, 99),
        };
    }

    /**
     * Build a performance report for a single pipeline
     */
    private buildPerformanceReport(
        pipeline: Pipeline,
        runs: PipelineRun[],
        aggregatedMetrics: {
            durations: number[];
            totalRecordsProcessed: number;
            totalRecordsFailed: number;
            successfulRuns: number;
        },
    ): PipelinePerformance {
        const trends = this.calculatePerformanceTrends(aggregatedMetrics.durations);
        return {
            pipelineId: pipeline.id.toString(),
            pipelineCode: pipeline.code,
            pipelineName: pipeline.name,
            totalRuns: runs.length,
            successfulRuns: aggregatedMetrics.successfulRuns,
            failedRuns: runs.length - aggregatedMetrics.successfulRuns,
            successRate: calculateSuccessRate(aggregatedMetrics.successfulRuns, runs.length),
            avgDurationMs: trends.avgDurationMs,
            p50DurationMs: trends.p50DurationMs,
            p95DurationMs: trends.p95DurationMs,
            p99DurationMs: trends.p99DurationMs,
            totalRecordsProcessed: aggregatedMetrics.totalRecordsProcessed,
            totalRecordsFailed: aggregatedMetrics.totalRecordsFailed,
            lastRunAt: runs[0]?.createdAt,
            lastRunStatus: runs[0]?.status,
        };
    }

    /**
     * Get analytics overview
     */
    async getOverview(ctx: RequestContext): Promise<AnalyticsOverview> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        startOfWeek.setHours(0, 0, 0, 0);

        // Fetch all data in parallel
        const [totalPipelines, activePipelines, runsToday, runsThisWeek, todayRuns, weekRuns, activeJobs] =
            await this.fetchOverviewData(startOfDay, startOfWeek);

        // Aggregate run statistics and calculate success rates
        const runStats = this.aggregateRunStats(todayRuns, weekRuns);
        const successRates = this.calculateSuccessRates(
            runStats.successfulRunsToday,
            todayRuns.length,
            runStats.successfulRunsWeek,
            weekRuns.length,
        );

        // Build and return the overview metrics
        return this.buildOverviewMetrics({
            totalPipelines,
            activePipelines,
            runsToday,
            runsThisWeek,
            activeJobs,
            recordsProcessedToday: runStats.recordsProcessedToday,
            recordsFailedToday: runStats.recordsFailedToday,
            successRateToday: successRates.successRateToday,
            successRateWeek: successRates.successRateWeek,
            durations: runStats.durations,
        });
    }

    /**
     * Get pipeline performance metrics
     */
    async getPipelinePerformance(
        ctx: RequestContext,
        options?: {
            pipelineId?: string;
            timeRange?: TimeRange;
            limit?: number;
        },
    ): Promise<PipelinePerformance[]> {
        const startDate = getStartDate(options?.timeRange || '30d');

        // Fetch pipelines
        const pipelines = await this.fetchPipelines(options?.pipelineId, options?.limit);
        if (pipelines.length === 0) {
            return [];
        }

        // Batch load and group runs by pipeline
        const runsByPipelineId = await this.loadRunsByPipeline(pipelines, startDate);

        // Build performance reports for each pipeline
        const results = pipelines.map(pipeline => {
            const runs = runsByPipelineId.get(pipeline.id) || [];
            const aggregatedMetrics = this.aggregatePipelineMetrics(runs);
            return this.buildPerformanceReport(pipeline, runs, aggregatedMetrics);
        });

        // Sort by total runs descending
        return results.sort((a, b) => b.totalRuns - a.totalRuns);
    }

    /**
     * Fetch pipelines based on optional ID filter
     */
    private async fetchPipelines(pipelineId?: string, limit?: number): Promise<Pipeline[]> {
        if (pipelineId) {
            const pipeline = await this.connection.rawConnection.getRepository(Pipeline).findOne({
                where: { id: pipelineId as ID },
            });
            return pipeline ? [pipeline] : [];
        }
        return this.connection.rawConnection.getRepository(Pipeline).find({
            take: limit || PAGINATION.LIST_PAGE_SIZE,
        });
    }

    /**
     * Load all runs for given pipelines and group by pipeline ID
     */
    private async loadRunsByPipeline(
        pipelines: Pipeline[],
        startDate: Date,
    ): Promise<Map<string | number, PipelineRun[]>> {
        const pipelineIds = pipelines.map(p => p.id);
        const allRuns = await this.connection.rawConnection.getRepository(PipelineRun).find({
            where: {
                pipeline: { id: In(pipelineIds) },
                createdAt: MoreThan(startDate),
            },
            relations: ['pipeline'],
            order: { createdAt: SortOrder.DESC },
        });

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

    // ─────────────────────────────────────────────────────────────────────────────
    // Private helper methods for getErrorAnalytics
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Build where clause for error analytics query
     */
    private buildErrorWhereClause(startDate: Date, pipelineId?: string): FindOptionsWhere<DataHubRecordError> {
        const whereClause: FindOptionsWhere<DataHubRecordError> = { createdAt: MoreThan(startDate) };
        if (pipelineId) {
            whereClause.run = { pipeline: { id: pipelineId as ID } };
        }
        return whereClause;
    }

    /**
     * Group errors and build analytics result
     */
    private buildErrorAnalyticsResult(errors: DataHubRecordError[], timeRange: TimeRange): ErrorAnalytics {
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

        return { totalErrors: errors.length, errorsByStep, errorsByPipeline, topErrors, errorTrend };
    }

    /**
     * Get error analytics
     */
    async getErrorAnalytics(
        ctx: RequestContext,
        options?: {
            pipelineId?: string;
            timeRange?: TimeRange;
        },
    ): Promise<ErrorAnalytics> {
        const timeRange = options?.timeRange || '7d';
        const startDate = getStartDate(timeRange);
        const whereClause = this.buildErrorWhereClause(startDate, options?.pipelineId);

        const errors = await this.connection.rawConnection.getRepository(DataHubRecordError).find({
            where: whereClause,
            relations: ['run', 'run.pipeline'],
            order: { createdAt: SortOrder.DESC },
        });

        return this.buildErrorAnalyticsResult(errors, timeRange);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Private helper methods for getThroughputMetrics
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Process runs to calculate throughput data points and peak throughput
     */
    private calculateThroughputData(runs: Array<{ metrics: PipelineMetrics | null; createdAt: Date }>): {
        totalRecords: number;
        peakThroughput: number;
        peakThroughputAt: Date;
        throughputPoints: ThroughputDataPoint[];
    } {
        let totalRecords = 0;
        let peakThroughput = 0;
        let peakThroughputAt = new Date();
        const throughputPoints: ThroughputDataPoint[] = [];

        for (const run of runs) {
            const metrics = extractRunMetrics(run.metrics);
            const records = metrics.recordsProcessed;
            const durationMs = metrics.durationMs || 1;
            totalRecords += records;

            const throughput = records / (durationMs / 1000); // records per second
            if (throughput > peakThroughput) {
                peakThroughput = throughput;
                peakThroughputAt = run.createdAt;
            }

            throughputPoints.push({ timestamp: run.createdAt, records, durationMs });
        }

        return { totalRecords, peakThroughput, peakThroughputAt, throughputPoints };
    }

    /**
     * Build the final throughput metrics result
     */
    private buildThroughputResult(
        throughputData: { totalRecords: number; peakThroughput: number; peakThroughputAt: Date; throughputPoints: ThroughputDataPoint[] },
        durationHours: number,
        timeRange: TimeRange,
    ): ThroughputMetrics {
        const rates = calculateThroughputRates(throughputData.totalRecords, durationHours);
        const throughputTrend = calculateThroughputTimeSeries(throughputData.throughputPoints, timeRange);

        return {
            recordsPerSecond: rates.recordsPerSecond,
            recordsPerMinute: rates.recordsPerMinute,
            recordsPerHour: rates.recordsPerHour,
            peakThroughput: Math.round(throughputData.peakThroughput * 100) / 100,
            peakThroughputAt: throughputData.peakThroughputAt,
            throughputTrend,
        };
    }

    /**
     * Get throughput metrics
     */
    async getThroughputMetrics(
        ctx: RequestContext,
        options?: {
            pipelineId?: string;
            timeRange?: TimeRange;
        },
    ): Promise<ThroughputMetrics> {
        const timeRange = options?.timeRange || '24h';
        const startDate = getStartDate(timeRange);
        const durationHours = (Date.now() - startDate.getTime()) / TIME.HOUR;

        const whereClause: FindOptionsWhere<PipelineRun> = { createdAt: MoreThan(startDate) };
        if (options?.pipelineId) {
            whereClause.pipeline = { id: options.pipelineId as ID };
        }

        const runs = await this.connection.rawConnection.getRepository(PipelineRun).find({
            where: whereClause,
            select: ['metrics', 'createdAt', 'finishedAt'],
        });

        const throughputData = this.calculateThroughputData(runs);
        return this.buildThroughputResult(throughputData, durationHours, timeRange);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Private helper methods for getRunHistory
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Build where clause for run history query
     */
    private buildRunHistoryWhereClause(options?: {
        pipelineId?: string;
        status?: string;
        timeRange?: TimeRange;
    }): FindOptionsWhere<PipelineRun> {
        const whereClause: FindOptionsWhere<PipelineRun> = {};
        if (options?.pipelineId) {
            whereClause.pipeline = { id: options.pipelineId as ID };
        }
        if (options?.status) {
            whereClause.status = options.status as RunStatus;
        }
        if (options?.timeRange) {
            whereClause.createdAt = MoreThan(getStartDate(options.timeRange));
        }
        return whereClause;
    }

    /**
     * Map pipeline run to run history item
     */
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

    /**
     * Get run history with pagination
     */
    async getRunHistory(
        ctx: RequestContext,
        options?: {
            pipelineId?: string;
            status?: string;
            timeRange?: TimeRange;
            limit?: number;
            offset?: number;
        },
    ): Promise<{ runs: RunHistoryItem[]; totalItems: number }> {
        const whereClause = this.buildRunHistoryWhereClause(options);

        const [runs, totalItems] = await this.connection.rawConnection.getRepository(PipelineRun).findAndCount({
            where: whereClause,
            relations: ['pipeline'],
            order: { createdAt: SortOrder.DESC },
            take: options?.limit || PAGINATION.LIST_PAGE_SIZE,
            skip: options?.offset || 0,
        });

        return {
            runs: runs.map(run => this.mapRunToHistoryItem(run)),
            totalItems,
        };
    }

    /**
     * Get real-time stats (for dashboard polling)
     */
    async getRealTimeStats(ctx: RequestContext): Promise<RealTimeStats> {
        const oneMinuteAgo = new Date(Date.now() - TIME.ONE_MINUTE_MS);
        const fiveMinutesAgo = new Date(Date.now() - TIME.FIVE_MINUTES_MS);

        const [activeRuns, queuedRuns, recentErrors, recentRuns] = await Promise.all([
            this.connection.rawConnection.getRepository(PipelineRun).count({
                where: { status: RunStatus.RUNNING },
            }),
            this.connection.rawConnection.getRepository(PipelineRun).count({
                where: { status: RunStatus.PENDING },
            }),
            this.connection.rawConnection.getRepository(DataHubRecordError).count({
                where: { createdAt: MoreThan(fiveMinutesAgo) },
            }),
            this.connection.rawConnection.getRepository(PipelineRun).find({
                where: { finishedAt: MoreThan(oneMinuteAgo) },
                select: ['metrics'],
            }),
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
