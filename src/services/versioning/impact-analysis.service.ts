import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    PipelineDefinition,
    PipelineMetrics,
    DEFAULT_IMPACT_ANALYSIS_OPTIONS,
    DurationEstimate,
    EntityImpact,
    FieldChangePreview,
    ImpactAnalysis,
    ImpactAnalysisOptions,
    ImpactSummary,
    RecordDetail,
    ResourceEstimate,
    RiskAssessment,
    SampleRecordFlow,
    StepTransformation,
} from '../../types/index';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { Pipeline } from '../../entities/pipeline';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { RiskLevel } from '../../constants/enums';
import {
    collectEntityBreakdown,
    generateSampleFlows,
    generateStepTransformations,
    findStep,
    SampleRecord,
} from './impact-collectors';
import { detectFieldChanges } from './field-detection';
import {
    calculateSummary,
    estimateDuration,
    estimateResources,
} from './impact-estimators';

/**
 * Service for analyzing the impact of pipeline execution before running
 */
@Injectable()
export class ImpactAnalysisService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private adapterRuntime: AdapterRuntimeService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    /**
     * Analyze the impact of running a pipeline
     */
    async analyze(
        ctx: RequestContext,
        pipelineId: ID,
        options: ImpactAnalysisOptions = {},
    ): Promise<ImpactAnalysis> {
        const { opts, startTime, pipeline } = await this.initializeAnalysis(ctx, pipelineId, options);

        const impactData = await this.collectImpactData(ctx, pipelineId, pipeline, opts);

        return this.buildAnalysisResult(pipelineId, opts, startTime, impactData);
    }

    /**
     * Initialize analysis by loading pipeline and merging options
     */
    private async initializeAnalysis(
        ctx: RequestContext,
        pipelineId: ID,
        options: ImpactAnalysisOptions,
    ): Promise<{ opts: ImpactAnalysisOptions; startTime: number; pipeline: Pipeline }> {
        const opts = { ...DEFAULT_IMPACT_ANALYSIS_OPTIONS, ...options };
        const startTime = Date.now();

        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { id: pipelineId },
        });
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }

        return { opts, startTime, pipeline };
    }

    /**
     * Collect all impact data from dry run execution
     */
    private async collectImpactData(
        ctx: RequestContext,
        pipelineId: ID,
        pipeline: Pipeline,
        opts: ImpactAnalysisOptions,
    ): Promise<{
        entityBreakdown: EntityImpact[];
        sampleRecords: SampleRecordFlow[];
        summary: ImpactSummary;
        estimatedDuration: DurationEstimate;
        resourceUsage: ResourceEstimate;
        metrics: PipelineMetrics;
    }> {
        const dryRunResult = await this.adapterRuntime.executeDryRun(ctx, pipeline.definition);

        const entityBreakdown = collectEntityBreakdown(
            dryRunResult.sampleRecords,
            pipeline.definition,
            opts.sampleSize ?? DEFAULT_IMPACT_ANALYSIS_OPTIONS.sampleSize,
        );

        const sampleRecords = generateSampleFlows(
            dryRunResult.sampleRecords,
            pipeline.definition,
        );

        const summary = calculateSummary(entityBreakdown, dryRunResult.metrics);
        const estimatedDurationResult = await estimateDuration(
            ctx,
            pipelineId,
            dryRunResult.metrics,
            this.connection,
        );
        const resourceUsage = estimateResources(
            pipeline.definition,
            dryRunResult.metrics.totalRecords ?? 0,
        );

        return {
            entityBreakdown,
            sampleRecords,
            summary,
            estimatedDuration: estimatedDurationResult,
            resourceUsage,
            metrics: dryRunResult.metrics,
        };
    }

    /**
     * Build the final analysis result object
     */
    private buildAnalysisResult(
        pipelineId: ID,
        opts: ImpactAnalysisOptions,
        startTime: number,
        impactData: {
            entityBreakdown: EntityImpact[];
            sampleRecords: SampleRecordFlow[];
            summary: ImpactSummary;
            estimatedDuration: DurationEstimate;
            resourceUsage: ResourceEstimate;
            metrics: PipelineMetrics;
        },
    ): ImpactAnalysis {
        const riskAssessment: RiskAssessment = {
            level: RiskLevel.LOW,
            score: 0,
            warnings: [],
        };

        const analysisTime = Date.now() - startTime;
        this.logger.debug('Impact analysis completed', {
            pipelineId,
            sampleSize: opts.sampleSize,
            analysisTimeMs: analysisTime,
        });

        return {
            summary: impactData.summary,
            entityBreakdown: impactData.entityBreakdown,
            riskAssessment,
            sampleRecords: impactData.sampleRecords,
            estimatedDuration: impactData.estimatedDuration,
            resourceUsage: impactData.resourceUsage,
            analyzedAt: new Date(),
            sampleSize: impactData.metrics.totalRecords ?? 0,
            fullDatasetSize: null,
        };
    }

    /**
     * Get detailed record information for drill-down
     */
    async getRecordDetails(
        ctx: RequestContext,
        pipelineId: ID,
        recordIds: string[],
    ): Promise<RecordDetail[]> {
        const details: RecordDetail[] = [];

        this.logger.debug('Record details requested', {
            pipelineId,
            recordCount: recordIds.length,
        });

        return details;
    }

    /**
     * Analyze impact of a specific step
     */
    async analyzeStep(
        ctx: RequestContext,
        pipelineId: ID,
        stepKey: string,
        _options: ImpactAnalysisOptions = {},
    ): Promise<{
        stepKey: string;
        recordsIn: number;
        recordsOut: number;
        transformations: StepTransformation[];
        fieldChanges: FieldChangePreview[];
    }> {
        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { id: pipelineId },
        });
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }

        const step = findStep(pipeline.definition, stepKey);
        if (!step) {
            throw new Error(`Step ${stepKey} not found in pipeline ${pipelineId}`);
        }

        // Run dry run and filter for this step
        const dryRunResult = await this.adapterRuntime.executeDryRun(ctx, pipeline.definition);
        const stepSamples: SampleRecord[] = dryRunResult.sampleRecords.filter(s => s.step === stepKey);

        const fieldChanges = detectFieldChanges(stepSamples);
        const transformations = generateStepTransformations(stepSamples, stepKey, step);

        return {
            stepKey,
            recordsIn: stepSamples.length,
            recordsOut: stepSamples.length,
            transformations,
            fieldChanges,
        };
    }
}
