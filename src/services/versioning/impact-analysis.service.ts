import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    PipelineDefinition,
    PipelineMetrics,
    StepType,
    DEFAULT_IMPACT_ANALYSIS_OPTIONS,
    DurationEstimate,
    EntityImpact,
    EntityOperations,
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
import { LOGGER_CONTEXTS, SortOrder, RunStatus, IMPACT_ANALYSIS } from '../../constants/index';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import {
    VendureEntityType,
    RiskLevel,
    EstimateConfidence,
    EstimateBasis,
    FlowOutcome,
    ImpactFieldChangeType,
    SandboxLoadResultType,
} from '../../constants/enums';
import { getAdapterCode } from '../../types/step-configs';

interface EntityBreakdownCollector {
    [entityType: string]: {
        operations: EntityOperations;
        fieldChanges: Map<string, FieldChangePreview>;
        sampleRecordIds: string[];
    };
}

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

        const entityBreakdown = this.collectEntityBreakdown(
            dryRunResult.sampleRecords,
            pipeline.definition,
            opts.sampleSize ?? DEFAULT_IMPACT_ANALYSIS_OPTIONS.sampleSize,
        );

        const sampleRecords = this.generateSampleFlows(
            dryRunResult.sampleRecords,
            pipeline.definition,
        );

        const summary = this.calculateSummary(entityBreakdown, dryRunResult.metrics);
        const estimatedDuration = await this.estimateDuration(ctx, pipelineId, dryRunResult.metrics);
        const resourceUsage = this.estimateResources(
            pipeline.definition,
            dryRunResult.metrics.totalRecords ?? 0,
        );

        return {
            entityBreakdown,
            sampleRecords,
            summary,
            estimatedDuration,
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

        const step = this.findStep(pipeline.definition, stepKey);
        if (!step) {
            throw new Error(`Step ${stepKey} not found in pipeline ${pipelineId}`);
        }

        // Run dry run and filter for this step
        const dryRunResult = await this.adapterRuntime.executeDryRun(ctx, pipeline.definition);
        const stepSamples = dryRunResult.sampleRecords.filter(s => s.step === stepKey);

        const fieldChanges = this.detectFieldChanges(stepSamples);

        return {
            stepKey,
            recordsIn: stepSamples.length,
            recordsOut: stepSamples.length,
            transformations: stepSamples.map((sample) => ({
                stepKey,
                stepType: step.type,
                stepName: step.name || stepKey,
                input: sample.before,
                output: sample.after,
                durationMs: 0,
                notes: [],
                recordsIn: 1,
                recordsOut: 1,
            })),
            fieldChanges,
        };
    }

    // Private helper methods

    private collectEntityBreakdown(
        sampleRecords: Array<{ step: string; before: Record<string, unknown>; after: Record<string, unknown> }>,
        definition: PipelineDefinition,
        _sampleSize: number,
    ): EntityImpact[] {
        const collector: EntityBreakdownCollector = {};
        const entityTypes = this.initializeEntityCollectors(definition, collector);

        for (const sample of sampleRecords) {
            this.processEntityRecord(sample, entityTypes, collector);
        }

        return Object.entries(collector).map(([entityType, data]) => ({
            entityType,
            operations: data.operations,
            fieldChanges: Array.from(data.fieldChanges.values()),
            sampleRecordIds: data.sampleRecordIds,
        }));
    }

    /**
     * Initialize entity collectors based on load steps in the pipeline definition
     */
    private initializeEntityCollectors(
        definition: PipelineDefinition,
        collector: EntityBreakdownCollector,
    ): Set<string> {
        const loadSteps = this.getLoadSteps(definition);
        const entityTypes = new Set<string>();

        for (const step of loadSteps) {
            const adapterCode = getAdapterCode(step) || 'unknown';
            const entityType = this.inferEntityType(adapterCode);
            entityTypes.add(entityType);
        }

        for (const entityType of entityTypes) {
            collector[entityType] = {
                operations: { create: 0, update: 0, delete: 0, skip: 0, error: 0 },
                fieldChanges: new Map(),
                sampleRecordIds: [],
            };
        }

        return entityTypes;
    }

    /**
     * Process a single entity record and update the collector
     */
    private processEntityRecord(
        sample: { step: string; before: Record<string, unknown>; after: Record<string, unknown> },
        entityTypes: Set<string>,
        collector: EntityBreakdownCollector,
    ): void {
        const entityType = this.inferEntityTypeFromSample(sample, entityTypes);

        if (!collector[entityType]) {
            collector[entityType] = {
                operations: { create: 0, update: 0, delete: 0, skip: 0, error: 0 },
                fieldChanges: new Map(),
                sampleRecordIds: [],
            };
        }

        const operation = this.inferOperation(sample);
        collector[entityType].operations[operation]++;

        const recordId = this.extractRecordId(sample.after);
        if (recordId && collector[entityType].sampleRecordIds.length < IMPACT_ANALYSIS.MAX_SAMPLE_RECORD_IDS) {
            collector[entityType].sampleRecordIds.push(recordId);
        }

        this.trackFieldChanges(sample, collector[entityType].fieldChanges);
    }

    private generateSampleFlows(
        sampleRecords: Array<{ step: string; before: Record<string, unknown>; after: Record<string, unknown> }>,
        definition: PipelineDefinition,
    ): SampleRecordFlow[] {
        // Group samples by a record identifier to show flow through pipeline
        const flows: Map<string, SampleRecordFlow> = new Map();

        for (const sample of sampleRecords) {
            const recordId = this.extractRecordId(sample.after) || `sample-${flows.size}`;

            let flow = flows.get(recordId);
            if (!flow) {
                flow = {
                    recordId,
                    sourceData: sample.before,
                    steps: [],
                    finalData: null,
                    outcome: FlowOutcome.SUCCESS,
                };
                flows.set(recordId, flow);
            }

            const step = this.findStep(definition, sample.step);

            flow.steps.push({
                stepKey: sample.step,
                stepType: step?.type || 'unknown',
                stepName: step?.name || sample.step,
                input: sample.before,
                output: sample.after,
                durationMs: 0,
                notes: [],
                recordsIn: 1,
                recordsOut: 1,
            });

            flow.finalData = sample.after;
        }

        return Array.from(flows.values()).slice(0, IMPACT_ANALYSIS.MAX_SAMPLE_FLOWS);
    }

    private calculateSummary(entityBreakdown: EntityImpact[], metrics: PipelineMetrics): ImpactSummary {
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

    private async estimateDuration(
        ctx: RequestContext,
        pipelineId: ID,
        metrics: PipelineMetrics,
    ): Promise<DurationEstimate> {
        const historicalData = await this.fetchHistoricalData(ctx, pipelineId);

        if (historicalData.length > 0) {
            const estimate = this.calculateEstimates(historicalData, metrics);
            if (estimate) {
                return estimate;
            }
        }

        return this.createSamplingBasedEstimate(metrics);
    }

    /**
     * Fetch historical run data for duration estimation
     */
    private async fetchHistoricalData(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<PipelineRun[]> {
        const runRepo = this.connection.getRepository(ctx, PipelineRun);

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
    private calculateEstimates(
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
    private createSamplingBasedEstimate(metrics: PipelineMetrics): DurationEstimate {
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

    private estimateResources(definition: PipelineDefinition, recordCount: number): ResourceEstimate {
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

    private detectFieldChanges(
        samples: Array<{ step: string; before: Record<string, unknown>; after: Record<string, unknown> }>,
    ): FieldChangePreview[] {
        const fieldMap = new Map<string, FieldChangePreview>();

        for (const sample of samples) {
            const beforeFields = new Set(Object.keys(sample.before || {}));
            const afterFields = new Set(Object.keys(sample.after || {}));

            // Added fields
            for (const field of afterFields) {
                if (!beforeFields.has(field)) {
                    this.updateFieldChange(fieldMap, field, ImpactFieldChangeType.SET, sample.before[field], sample.after[field]);
                }
            }

            // Removed fields
            for (const field of beforeFields) {
                if (!afterFields.has(field)) {
                    this.updateFieldChange(fieldMap, field, ImpactFieldChangeType.REMOVE, sample.before[field], sample.after[field]);
                }
            }

            // Modified fields
            for (const field of afterFields) {
                if (beforeFields.has(field) && sample.before[field] !== sample.after[field]) {
                    const changeType = this.isTransform(sample.before[field], sample.after[field])
                        ? ImpactFieldChangeType.TRANSFORM
                        : ImpactFieldChangeType.UPDATE;
                    this.updateFieldChange(fieldMap, field, changeType, sample.before[field], sample.after[field]);
                }
            }
        }

        return Array.from(fieldMap.values());
    }

    private updateFieldChange(
        map: Map<string, FieldChangePreview>,
        field: string,
        changeType: ImpactFieldChangeType,
        before: unknown,
        after: unknown,
    ): void {
        let change = map.get(field);
        if (!change) {
            change = {
                field,
                changeType,
                affectedCount: 0,
                sampleBefore: [],
                sampleAfter: [],
            };
            map.set(field, change);
        }

        change.affectedCount++;
        if (change.sampleBefore.length < IMPACT_ANALYSIS.MAX_SAMPLE_FIELD_VALUES) {
            change.sampleBefore.push(before);
            change.sampleAfter.push(after);
        }
    }

    private trackFieldChanges(
        sample: { before: Record<string, unknown>; after: Record<string, unknown> },
        fieldChanges: Map<string, FieldChangePreview>,
    ): void {
        const changes = this.detectFieldChanges([{ step: '', ...sample }]);
        for (const change of changes) {
            const existing = fieldChanges.get(change.field);
            if (existing) {
                existing.affectedCount += change.affectedCount;
            } else {
                fieldChanges.set(change.field, change);
            }
        }
    }

    private isTransform(before: unknown, after: unknown): boolean {
        // Check if value was transformed (type changed or significant modification)
        return typeof before !== typeof after ||
            (typeof before === 'string' && typeof after === 'string' &&
                (after as string).length !== (before as string).length);
    }

    private getLoadSteps(definition: PipelineDefinition): PipelineDefinition['steps'] {
        return (definition.steps || []).filter(s => s.type === StepType.LOAD);
    }

    private inferEntityType(adapterCode: string): string {
        // Map adapter codes to entity types
        const mapping: Record<string, string> = {
            'vendure-products': VendureEntityType.PRODUCT,
            'vendure-variants': VendureEntityType.PRODUCT_VARIANT,
            'vendure-customers': VendureEntityType.CUSTOMER,
            'vendure-orders': VendureEntityType.ORDER,
            'vendure-collections': VendureEntityType.COLLECTION,
            'vendure-facets': VendureEntityType.FACET,
            'vendure-assets': VendureEntityType.ASSET,
            'vendure-product-sync': VendureEntityType.PRODUCT,
        };

        return mapping[adapterCode] || 'Entity';
    }

    private inferEntityTypeFromSample(
        sample: { step: string; after: Record<string, unknown> },
        entityTypes: Set<string>,
    ): string {
        // Try to infer from record structure
        if (sample.after.__typename) {
            return String(sample.after.__typename);
        }

        // Return first known entity type
        return entityTypes.values().next().value || 'Entity';
    }

    private inferOperation(
        sample: { before: Record<string, unknown>; after: Record<string, unknown> },
    ): SandboxLoadResultType {
        const isEmpty = (obj: Record<string, unknown>) =>
            !obj || Object.keys(obj).length === 0;

        if (isEmpty(sample.before) && !isEmpty(sample.after)) {
            return SandboxLoadResultType.CREATE;
        }
        if (!isEmpty(sample.before) && isEmpty(sample.after)) {
            return SandboxLoadResultType.DELETE;
        }
        if (isEmpty(sample.before) && isEmpty(sample.after)) {
            return SandboxLoadResultType.SKIP;
        }
        return SandboxLoadResultType.UPDATE;
    }

    private extractRecordId(record: Record<string, unknown>): string | null {
        // Try common ID fields
        const idFields = ['id', '_id', 'ID', 'Id', 'sku', 'code', 'uuid'];
        for (const field of idFields) {
            if (record[field] != null) {
                return String(record[field]);
            }
        }
        return null;
    }

    private findStep(definition: PipelineDefinition, stepKey: string): PipelineDefinition['steps'][number] | null {
        return (definition.steps || []).find(s => s.key === stepKey) || null;
    }
}
