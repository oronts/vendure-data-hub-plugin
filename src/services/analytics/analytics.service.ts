/**
 * Analytics Service
 *
 * Provides analytics and metrics for pipeline runs and performance monitoring.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    TransactionalConnection,
    RequestContext,
} from '@vendure/core';
import { MoreThan } from 'typeorm';
import { PipelineRun, Pipeline } from '../../entities/pipeline';
import { DataHubRecordError } from '../../entities/data';
import { RunStatus } from '../../types/index';
import { DEFAULTS, TIME, LOGGER_CONTEXTS } from '../../constants/index';
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

    /**
     * Get analytics overview
     */
    async getOverview(ctx: RequestContext): Promise<AnalyticsOverview> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Get pipeline counts
        const [totalPipelines, activePipelines] = await Promise.all([
            this.connection.rawConnection.getRepository(Pipeline).count(),
            this.connection.rawConnection.getRepository(Pipeline).count({
                where: { enabled: true },
            }),
        ]);

        const runsToday = await this.connection.rawConnection.getRepository(PipelineRun).count({
            where: { createdAt: MoreThan(startOfDay) },
        });

        const todayRuns = await this.connection.rawConnection.getRepository(PipelineRun).find({
            where: { createdAt: MoreThan(startOfDay) },
            select: ['status', 'metrics'],
        });

        let recordsProcessedToday = 0;
        let recordsFailedToday = 0;
        let successfulRuns = 0;
        const durations: number[] = [];

        for (const run of todayRuns) {
            const metrics = extractRunMetrics(run.metrics);
            recordsProcessedToday += metrics.recordsProcessed;
            recordsFailedToday += metrics.recordsFailed;
            if (metrics.durationMs) {
                durations.push(metrics.durationMs);
            }
            if (run.status === 'COMPLETED') {
                successfulRuns++;
            }
        }

        return {
            totalPipelines,
            activePipelines,
            runsToday,
            recordsProcessedToday,
            recordsFailedToday,
            successRate: calculateSuccessRate(successfulRuns, todayRuns.length),
            avgDurationMs: calculateAverage(durations),
        };
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

        let pipelines: Pipeline[];
        if (options?.pipelineId) {
            const pipeline = await this.connection.rawConnection.getRepository(Pipeline).findOne({
                where: { id: options.pipelineId as any },
            });
            pipelines = pipeline ? [pipeline] : [];
        } else {
            pipelines = await this.connection.rawConnection.getRepository(Pipeline).find({
                take: options?.limit || DEFAULTS.LIST_PAGE_SIZE,
            });
        }

        const results: PipelinePerformance[] = [];

        for (const pipeline of pipelines) {
            const runs = await this.connection.rawConnection.getRepository(PipelineRun).find({
                where: {
                    pipeline: { id: pipeline.id },
                    createdAt: MoreThan(startDate),
                },
                order: { createdAt: 'DESC' },
            });

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
                if (run.status === 'COMPLETED') {
                    successfulRuns++;
                }
            }

            // Sort durations for percentiles
            durations.sort((a, b) => a - b);

            const performance: PipelinePerformance = {
                pipelineId: pipeline.id.toString(),
                pipelineCode: pipeline.code,
                pipelineName: pipeline.name,
                totalRuns: runs.length,
                successfulRuns,
                failedRuns: runs.length - successfulRuns,
                successRate: calculateSuccessRate(successfulRuns, runs.length),
                avgDurationMs: calculateAverage(durations),
                p50DurationMs: percentile(durations, 50),
                p95DurationMs: percentile(durations, 95),
                p99DurationMs: percentile(durations, 99),
                totalRecordsProcessed,
                totalRecordsFailed,
                lastRunAt: runs[0]?.createdAt,
                lastRunStatus: runs[0]?.status,
            };

            results.push(performance);
        }

        // Sort by total runs descending
        results.sort((a, b) => b.totalRuns - a.totalRuns);

        return results;
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
        const startDate = getStartDate(options?.timeRange || '7d');

        const whereClause: any = {
            createdAt: MoreThan(startDate),
        };

        if (options?.pipelineId) {
            whereClause.run = { pipeline: { id: options.pipelineId } };
        }

        const errors = await this.connection.rawConnection.getRepository(DataHubRecordError).find({
            where: whereClause,
            relations: ['run', 'run.pipeline'],
            order: { createdAt: 'DESC' },
        });

        // Group errors by step
        const errorsByStep = groupErrorsByKey(errors, error => error.stepKey);

        // Group errors by pipeline
        const errorsByPipeline = groupErrorsByKey(
            errors,
            error => error.run?.pipeline?.code || 'unknown',
        );

        // Get top errors
        const topErrors = getTopErrors(
            errors.map(e => ({ message: e.message, createdAt: e.createdAt })),
            DEFAULTS.TOP_ERRORS_LIMIT,
        );

        // Calculate error trend
        const errorTrend = calculateTimeSeries(
            errors.map(e => e.createdAt),
            options?.timeRange || '7d',
        );

        return {
            totalErrors: errors.length,
            errorsByStep,
            errorsByPipeline,
            topErrors,
            errorTrend,
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
        const startDate = getStartDate(options?.timeRange || '24h');
        const now = new Date();
        const durationHours = (now.getTime() - startDate.getTime()) / TIME.HOUR;

        const whereClause: any = {
            createdAt: MoreThan(startDate),
        };

        if (options?.pipelineId) {
            whereClause.pipeline = { id: options.pipelineId };
        }

        const runs = await this.connection.rawConnection.getRepository(PipelineRun).find({
            where: whereClause,
            select: ['metrics', 'createdAt', 'finishedAt'],
        });

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

            throughputPoints.push({
                timestamp: run.createdAt,
                records,
                durationMs,
            });
        }

        const rates = calculateThroughputRates(totalRecords, durationHours);
        const throughputTrend = calculateThroughputTimeSeries(throughputPoints, options?.timeRange || '24h');

        return {
            recordsPerSecond: rates.recordsPerSecond,
            recordsPerMinute: rates.recordsPerMinute,
            recordsPerHour: rates.recordsPerHour,
            peakThroughput: Math.round(peakThroughput * 100) / 100,
            peakThroughputAt,
            throughputTrend,
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
        const startDate = options?.timeRange ? getStartDate(options.timeRange) : undefined;

        const whereClause: any = {};
        if (options?.pipelineId) {
            whereClause.pipeline = { id: options.pipelineId };
        }
        if (options?.status) {
            whereClause.status = options.status;
        }
        if (startDate) {
            whereClause.createdAt = MoreThan(startDate);
        }

        const [runs, totalItems] = await this.connection.rawConnection.getRepository(PipelineRun).findAndCount({
            where: whereClause,
            relations: ['pipeline'],
            order: { createdAt: 'DESC' },
            take: options?.limit || DEFAULTS.LIST_PAGE_SIZE,
            skip: options?.offset || 0,
        });

        return {
            runs: runs.map(run => {
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
            }),
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
