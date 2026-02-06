/**
 * Duration and resource estimation utilities for impact analysis
 */
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    PipelineDefinition,
    PipelineMetrics,
    DurationEstimate,
    ResourceEstimate,
    ImpactSummary,
    EntityImpact,
} from '../../types/index';
import { IMPACT_ANALYSIS, SortOrder, RunStatus, StepType } from '../../constants/index';
import { PipelineRun } from '../../entities/pipeline';
import { EstimateConfidence, EstimateBasis } from '../../constants/enums';

/**
 * Calculate impact summary from entity breakdown and metrics
 */
export function calculateSummary(entityBreakdown: EntityImpact[], metrics: PipelineMetrics): ImpactSummary {
    let totalCreate = 0;
    let totalUpdate = 0;
    let totalDelete = 0;
    let totalSkip = 0;
    let totalError = 0;

    for (const entity of entityBreakdown) {
        totalCreate += entity.operations.create;
        totalUpdate += entity.operations.update;
        totalDelete += entity.operations.delete;
        totalSkip += entity.operations.skip;
        totalError += entity.operations.error;
    }

    return {
        totalRecordsToProcess: metrics.totalRecords ?? 0,
        estimatedSuccessCount: totalCreate + totalUpdate + totalDelete,
        estimatedFailureCount: totalError,
        estimatedSkipCount: totalSkip,
        affectedEntities: entityBreakdown.map(e => e.entityType),
    };
}

/**
 * Estimate pipeline execution duration based on historical data or sampling
 */
export async function estimateDuration(
    ctx: RequestContext,
    pipelineId: ID,
    metrics: PipelineMetrics,
    connection: TransactionalConnection,
): Promise<DurationEstimate> {
    const historicalData = await fetchHistoricalData(ctx, pipelineId, connection);

    if (historicalData.length > 0) {
        const estimate = calculateHistoricalEstimates(historicalData, metrics);
        if (estimate) {
            return estimate;
        }
    }

    return createSamplingBasedEstimate(metrics);
}

/**
 * Fetch historical run data for duration estimation
 */
async function fetchHistoricalData(
    ctx: RequestContext,
    pipelineId: ID,
    connection: TransactionalConnection,
): Promise<PipelineRun[]> {
    const runRepo = connection.getRepository(ctx, PipelineRun);

    return runRepo.find({
        where: {
            pipelineId: Number(pipelineId),
            status: RunStatus.COMPLETED,
        },
        order: { finishedAt: SortOrder.DESC },
        take: IMPACT_ANALYSIS.RECENT_RUNS_COUNT,
    });
}

/**
 * Calculate duration estimates based on historical run data
 */
function calculateHistoricalEstimates(
    recentRuns: PipelineRun[],
    metrics: PipelineMetrics,
): DurationEstimate | null {
    const durations = recentRuns
        .filter(r => r.metrics?.durationMs != null && r.metrics?.processed != null)
        .map(r => {
            const durationMs = r.metrics?.durationMs ?? 0;
            const processed = r.metrics?.processed ?? 1;
            return {
                durationMs,
                processed,
                perRecord: durationMs / Math.max(processed, 1),
            };
        });

    if (durations.length === 0) {
        return null;
    }

    const avgPerRecord = durations.reduce((sum, d) => sum + d.perRecord, 0) / durations.length;
    const totalRecords = metrics.totalRecords ?? 0;
    const estimatedMs = avgPerRecord * totalRecords;

    return {
        estimatedMs: Math.round(estimatedMs),
        confidence: durations.length >= IMPACT_ANALYSIS.HIGH_CONFIDENCE_MIN_RUNS
            ? EstimateConfidence.HIGH
            : EstimateConfidence.MEDIUM,
        extractMs: Math.round(estimatedMs * IMPACT_ANALYSIS.EXTRACT_DURATION_RATIO),
        transformMs: Math.round(estimatedMs * IMPACT_ANALYSIS.TRANSFORM_DURATION_RATIO),
        loadMs: Math.round(estimatedMs * IMPACT_ANALYSIS.LOAD_DURATION_RATIO),
        basedOn: EstimateBasis.HISTORICAL,
    };
}

/**
 * Create a fallback sampling-based duration estimate
 */
function createSamplingBasedEstimate(metrics: PipelineMetrics): DurationEstimate {
    const baseDuration = metrics.durationMs ?? IMPACT_ANALYSIS.DEFAULT_BASE_DURATION_MS;
    const estimatedMs = baseDuration * IMPACT_ANALYSIS.SAMPLING_DURATION_MULTIPLIER;
    return {
        estimatedMs,
        confidence: EstimateConfidence.LOW,
        extractMs: Math.round(estimatedMs * IMPACT_ANALYSIS.SAMPLING_EXTRACT_RATIO),
        transformMs: Math.round(estimatedMs * IMPACT_ANALYSIS.SAMPLING_TRANSFORM_RATIO),
        loadMs: Math.round(estimatedMs * IMPACT_ANALYSIS.SAMPLING_LOAD_RATIO),
        basedOn: EstimateBasis.SAMPLING,
    };
}

/**
 * Estimate resource usage based on pipeline definition and record count
 */
export function estimateResources(definition: PipelineDefinition, recordCount: number): ResourceEstimate {
    const steps = definition.steps || [];
    const extractCount = steps.filter(s => s.type === StepType.EXTRACT).length;
    const transformCount = steps.filter(s => s.type === StepType.TRANSFORM).length;
    const loadCount = steps.filter(s => s.type === StepType.LOAD).length;

    // Memory: Base + per-record + per-transform
    const memoryMb = Math.round(
        IMPACT_ANALYSIS.BASE_MEMORY_MB +
        (recordCount * IMPACT_ANALYSIS.PER_RECORD_MEMORY_MB) +
        (transformCount * IMPACT_ANALYSIS.PER_TRANSFORM_MEMORY_MB)
    );

    // CPU: Estimate based on complexity
    const cpuPercent = Math.min(
        IMPACT_ANALYSIS.MAX_CPU_PERCENT,
        Math.round(
            IMPACT_ANALYSIS.BASE_CPU_PERCENT +
            (recordCount / 1000) * IMPACT_ANALYSIS.CPU_PER_1000_RECORDS +
            transformCount * IMPACT_ANALYSIS.CPU_PER_TRANSFORM
        )
    );

    // Network calls: Extract + Load operations
    const networkCalls = extractCount + loadCount;

    // Database queries: Load operations typically do multiple queries (batched)
    const databaseQueries = loadCount * Math.ceil(recordCount / IMPACT_ANALYSIS.DB_QUERY_BATCH_SIZE);

    return {
        memoryMb,
        cpuPercent,
        networkCalls,
        databaseQueries,
    };
}
