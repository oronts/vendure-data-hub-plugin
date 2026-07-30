import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import {
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
import {
    extractRecordDetails,
    fillUnknownRecordDetails,
} from './impact-record-details';
import { SANDBOX } from '../../constants';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { assertPipelinePermissionsAllowed } from '../pipeline/pipeline-capabilities';

/**
 * Service for analyzing the impact of pipeline execution before running
 */
@Injectable()
export class ImpactAnalysisService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private adapterRuntime: AdapterRuntimeService,
        private registry: DataHubRegistryService,
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
    ): Promise<{
        opts: Required<ImpactAnalysisOptions>;
        startTime: number;
        pipeline: Pipeline;
    }> {
        const opts = this.normalizeOptions(options);
        const startTime = Date.now();

        const pipeline = await this.getPipelineInActiveChannel(ctx, pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }

        return { opts, startTime, pipeline };
    }

    private normalizeOptions(options: ImpactAnalysisOptions): Required<ImpactAnalysisOptions> {
        const opts = { ...DEFAULT_IMPACT_ANALYSIS_OPTIONS, ...options };
        if (
            !Number.isSafeInteger(opts.sampleSize)
            || opts.sampleSize < 1
            || opts.sampleSize > SANDBOX.MAX_RECORDS
        ) {
            throw new Error(`sampleSize must be an integer from 1 to ${SANDBOX.MAX_RECORDS}`);
        }
        if (!Number.isFinite(opts.maxDurationMs) || opts.maxDurationMs <= 0) {
            throw new Error('maxDurationMs must be a positive number');
        }
        return opts;
    }

    /**
     * Collect all impact data from dry run execution
     */
    private async collectImpactData(
        ctx: RequestContext,
        pipelineId: ID,
        pipeline: Pipeline,
        opts: Required<ImpactAnalysisOptions>,
    ): Promise<{
        entityBreakdown: EntityImpact[];
        sampleRecords: SampleRecordFlow[];
        summary: ImpactSummary;
        estimatedDuration: DurationEstimate;
        resourceUsage: ResourceEstimate | null;
        metrics: PipelineMetrics;
    }> {
        const dryRunResult = await this.executeDryRunWithTimeout(
            ctx,
            pipeline.definition,
            opts,
        );
        const recordDetails = extractRecordDetails(dryRunResult.metrics);

        const entityBreakdown = collectEntityBreakdown(
            recordDetails,
            pipeline.definition,
            opts.sampleSize,
        );
        if (!opts.includeFieldChanges) {
            for (const entity of entityBreakdown) entity.fieldChanges = [];
        }

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
        const resourceUsage = opts.includeResourceEstimate
            ? estimateResources(
                pipeline.definition,
                dryRunResult.metrics.totalRecords ?? 0,
            )
            : null;

        return {
            entityBreakdown,
            sampleRecords,
            summary,
            estimatedDuration: estimatedDurationResult,
            resourceUsage,
            metrics: dryRunResult.metrics,
        };
    }

    private async executeDryRunWithTimeout(
        ctx: RequestContext,
        definition: Pipeline['definition'],
        opts: Required<ImpactAnalysisOptions>,
    ) {
        assertPipelinePermissionsAllowed(this.registry, ctx, definition);
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                this.adapterRuntime.executeDryRun(ctx, definition, opts.sampleSize),
                new Promise<never>((_resolve, reject) => {
                    timeout = setTimeout(
                        () => reject(new Error(
                            `Impact analysis exceeded ${opts.maxDurationMs}ms`,
                        )),
                        opts.maxDurationMs,
                    );
                }),
            ]);
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    /**
     * Build the final analysis result object
     */
    private buildAnalysisResult(
        pipelineId: ID,
        opts: Required<ImpactAnalysisOptions>,
        startTime: number,
        impactData: {
            entityBreakdown: EntityImpact[];
            sampleRecords: SampleRecordFlow[];
            summary: ImpactSummary;
            estimatedDuration: DurationEstimate;
            resourceUsage: ResourceEstimate | null;
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
        const pipeline = await this.getPipelineInActiveChannel(ctx, pipelineId);
        if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);
        const uniqueIds = [...new Set(recordIds)];
        if (uniqueIds.length === 0) return [];
        if (uniqueIds.length > SANDBOX.MAX_RECORDS) {
            throw new Error(`At most ${SANDBOX.MAX_RECORDS} record IDs can be requested`);
        }
        const opts = this.normalizeOptions({
            sampleSize: Math.max(
                DEFAULT_IMPACT_ANALYSIS_OPTIONS.sampleSize,
                uniqueIds.length,
            ),
        });
        const dryRunResult = await this.executeDryRunWithTimeout(
            ctx,
            pipeline.definition,
            opts,
        );
        const details = fillUnknownRecordDetails(
            uniqueIds,
            extractRecordDetails(dryRunResult.metrics),
            dryRunResult.sampleRecords,
            pipeline.definition,
        );

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
        options: ImpactAnalysisOptions = {},
    ): Promise<{
        stepKey: string;
        recordsIn: number;
        recordsOut: number;
        transformations: StepTransformation[];
        fieldChanges: FieldChangePreview[];
    }> {
        const pipeline = await this.getPipelineInActiveChannel(ctx, pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }

        const step = findStep(pipeline.definition, stepKey);
        if (!step) {
            throw new Error(`Step ${stepKey} not found in pipeline ${pipelineId}`);
        }

        const opts = this.normalizeOptions(options);
        const dryRunResult = await this.executeDryRunWithTimeout(
            ctx,
            pipeline.definition,
            opts,
        );
        const stepSamples: SampleRecord[] = dryRunResult.sampleRecords.filter(s => s.step === stepKey);

        const fieldChanges = opts.includeFieldChanges
            ? detectFieldChanges(stepSamples)
            : [];
        const transformations = generateStepTransformations(stepSamples, stepKey, step);
        const stepCounts = this.getStepCounts(
            dryRunResult.metrics,
            stepKey,
            stepSamples.length,
        );

        return {
            stepKey,
            recordsIn: stepCounts.recordsIn,
            recordsOut: stepCounts.recordsOut,
            transformations,
            fieldChanges,
        };
    }

    private getStepCounts(
        metrics: PipelineMetrics,
        stepKey: string,
        fallback: number,
    ): { recordsIn: number; recordsOut: number } {
        const details = Array.isArray(metrics.details) ? metrics.details : [];
        const detail = details.find(value => (
            value !== null
            && typeof value === 'object'
            && !Array.isArray(value)
            && value['stepKey'] === stepKey
        ));
        if (!detail || Array.isArray(detail) || typeof detail !== 'object') {
            return { recordsIn: fallback, recordsOut: fallback };
        }
        return {
            recordsIn: typeof detail['recordsIn'] === 'number'
                ? detail['recordsIn']
                : fallback,
            recordsOut: typeof detail['recordsOut'] === 'number'
                ? detail['recordsOut']
                : fallback,
        };
    }

    private getPipelineInActiveChannel(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<Pipeline | undefined> {
        return this.connection.findOneInChannel(
            ctx,
            Pipeline,
            pipelineId,
            ctx.channelId,
        );
    }
}
