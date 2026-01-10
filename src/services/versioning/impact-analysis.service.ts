import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { PipelineDefinition, PipelineMetrics, StepType } from '../../types/index';
import {
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
} from '../../types/impact-analysis.types';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';

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
        const opts = { ...DEFAULT_IMPACT_ANALYSIS_OPTIONS, ...options };
        const startTime = Date.now();

        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { id: pipelineId },
        });
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }

        // Execute dry run to get sample data
        const dryRunResult = await this.adapterRuntime.executeDryRun(ctx, pipeline.definition);

        // Collect entity breakdown from sample records
        const entityBreakdown = this.collectEntityBreakdown(
            dryRunResult.sampleRecords,
            pipeline.definition,
            opts.sampleSize,
        );

        // Generate sample record flows
        const sampleRecords = this.generateSampleFlows(
            dryRunResult.sampleRecords,
            pipeline.definition,
        );

        // Calculate summary
        const summary = this.calculateSummary(entityBreakdown, dryRunResult.metrics);

        // Estimate duration based on historical data
        const estimatedDuration = await this.estimateDuration(ctx, pipelineId, dryRunResult.metrics);

        // Estimate resource usage
        const resourceUsage = this.estimateResources(
            pipeline.definition,
            dryRunResult.metrics.totalRecords ?? 0,
        );

        // Risk assessment will be added by RiskAssessmentService
        const riskAssessment: RiskAssessment = {
            level: 'low',
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
            summary,
            entityBreakdown,
            riskAssessment,
            sampleRecords,
            estimatedDuration,
            resourceUsage,
            analyzedAt: new Date(),
            sampleSize: dryRunResult.metrics.totalRecords ?? 0,
            fullDatasetSize: null, // Would require extract to get full count
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
        // This would integrate with the actual data source to show
        // current vs proposed state for specific records
        const details: RecordDetail[] = [];

        // For now, return empty - would need actual record lookup
        // from the data sources configured in the pipeline
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
            transformations: stepSamples.map((sample, index) => ({
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
        sampleSize: number,
    ): EntityImpact[] {
        const collector: EntityBreakdownCollector = {};

        // Determine entity type from load steps
        const loadSteps = this.getLoadSteps(definition);
        const entityTypes = new Set<string>();

        for (const step of loadSteps) {
            const adapterCode = (step.config as any)?.adapterCode || 'unknown';
            const entityType = this.inferEntityType(adapterCode);
            entityTypes.add(entityType);
        }

        // Initialize collectors for each entity type
        for (const entityType of entityTypes) {
            collector[entityType] = {
                operations: { create: 0, update: 0, delete: 0, skip: 0, error: 0 },
                fieldChanges: new Map(),
                sampleRecordIds: [],
            };
        }

        // Process sample records to infer operations
        for (const sample of sampleRecords) {
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

            // Track sample record IDs
            const recordId = this.extractRecordId(sample.after);
            if (recordId && collector[entityType].sampleRecordIds.length < 10) {
                collector[entityType].sampleRecordIds.push(recordId);
            }

            // Track field changes
            this.trackFieldChanges(sample, collector[entityType].fieldChanges);
        }

        // Convert to EntityImpact array
        return Object.entries(collector).map(([entityType, data]) => ({
            entityType,
            operations: data.operations,
            fieldChanges: Array.from(data.fieldChanges.values()),
            sampleRecordIds: data.sampleRecordIds,
        }));
    }

    private generateSampleFlows(
        sampleRecords: Array<{ step: string; before: Record<string, unknown>; after: Record<string, unknown> }>,
        definition: PipelineDefinition,
    ): SampleRecordFlow[] {
        // Group samples by a record identifier to show flow through pipeline
        const flows: Map<string, SampleRecordFlow> = new Map();

        for (const sample of sampleRecords) {
            const recordId = this.extractRecordId(sample.after) || `sample-${flows.size}`;

            if (!flows.has(recordId)) {
                flows.set(recordId, {
                    recordId,
                    sourceData: sample.before,
                    steps: [],
                    finalData: null,
                    outcome: 'success',
                });
            }

            const flow = flows.get(recordId)!;
            const step = this.findStepByKey(definition, sample.step);

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

        return Array.from(flows.values()).slice(0, 10); // Limit to 10 flows
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
        const runRepo = this.connection.getRepository(ctx, PipelineRun);

        // Get recent successful runs for this pipeline
        const recentRuns = await runRepo.find({
            where: {
                pipeline: { id: pipelineId },
                status: 'SUCCESS' as any,
            },
            order: { finishedAt: 'DESC' },
            take: 5,
        });

        if (recentRuns.length > 0) {
            // Calculate average duration per record from historical runs
            const durations = recentRuns
                .filter(r => r.metrics?.durationMs != null && r.metrics?.processed != null)
                .map(r => {
                    const durationMs = r.metrics!.durationMs ?? 0;
                    const processed = r.metrics!.processed ?? 1;
                    return {
                        durationMs,
                        processed,
                        perRecord: durationMs / Math.max(processed, 1),
                    };
                });

            if (durations.length > 0) {
                const avgPerRecord = durations.reduce((sum, d) => sum + d.perRecord, 0) / durations.length;
                const totalRecords = metrics.totalRecords ?? 0;
                const estimatedMs = avgPerRecord * totalRecords;

                return {
                    estimatedMs: Math.round(estimatedMs),
                    confidence: durations.length >= 3 ? 'high' : 'medium',
                    extractMs: Math.round(estimatedMs * 0.3), // 30% for extract
                    transformMs: Math.round(estimatedMs * 0.2), // 20% for transform
                    loadMs: Math.round(estimatedMs * 0.5), // 50% for load
                    basedOn: 'historical',
                };
            }
        }

        // Fallback to sampling-based estimate
        const baseDuration = metrics.durationMs ?? 1000;
        return {
            estimatedMs: baseDuration * 10, // Rough extrapolation
            confidence: 'low',
            extractMs: Math.round(baseDuration * 3),
            transformMs: Math.round(baseDuration * 2),
            loadMs: Math.round(baseDuration * 5),
            basedOn: 'sampling',
        };
    }

    private estimateResources(definition: PipelineDefinition, recordCount: number): ResourceEstimate {
        // Basic resource estimation based on step types and record count
        const steps = definition.steps || [];
        const extractCount = steps.filter(s => s.type === StepType.EXTRACT).length;
        const transformCount = steps.filter(s => s.type === StepType.TRANSFORM).length;
        const loadCount = steps.filter(s => s.type === StepType.LOAD).length;

        // Memory: Base + per-record + per-transform
        const baseMemory = 50; // MB
        const perRecordMemory = 0.01; // MB per record
        const perTransformMemory = 10; // MB per transform step

        const memoryMb = Math.round(
            baseMemory +
            (recordCount * perRecordMemory) +
            (transformCount * perTransformMemory)
        );

        // CPU: Estimate based on complexity
        const cpuPercent = Math.min(
            100,
            Math.round(20 + (recordCount / 1000) * 5 + transformCount * 10)
        );

        // Network calls: Extract + Load operations
        const networkCalls = extractCount + loadCount;

        // Database queries: Load operations typically do multiple queries
        const databaseQueries = loadCount * Math.ceil(recordCount / 100); // Batched

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
                    this.updateFieldChange(fieldMap, field, 'set', sample.before[field], sample.after[field]);
                }
            }

            // Removed fields
            for (const field of beforeFields) {
                if (!afterFields.has(field)) {
                    this.updateFieldChange(fieldMap, field, 'remove', sample.before[field], sample.after[field]);
                }
            }

            // Modified fields
            for (const field of afterFields) {
                if (beforeFields.has(field) && sample.before[field] !== sample.after[field]) {
                    const changeType = this.isTransform(sample.before[field], sample.after[field])
                        ? 'transform'
                        : 'update';
                    this.updateFieldChange(fieldMap, field, changeType, sample.before[field], sample.after[field]);
                }
            }
        }

        return Array.from(fieldMap.values());
    }

    private updateFieldChange(
        map: Map<string, FieldChangePreview>,
        field: string,
        changeType: 'set' | 'update' | 'remove' | 'transform',
        before: unknown,
        after: unknown,
    ): void {
        if (!map.has(field)) {
            map.set(field, {
                field,
                changeType,
                affectedCount: 0,
                sampleBefore: [],
                sampleAfter: [],
            });
        }

        const change = map.get(field)!;
        change.affectedCount++;
        if (change.sampleBefore.length < 3) {
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
            if (fieldChanges.has(change.field)) {
                const existing = fieldChanges.get(change.field)!;
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

    private getLoadSteps(definition: PipelineDefinition): any[] {
        return (definition.steps || []).filter(s => s.type === StepType.LOAD);
    }

    private inferEntityType(adapterCode: string): string {
        // Map adapter codes to entity types
        const mapping: Record<string, string> = {
            'vendure-products': 'Product',
            'vendure-variants': 'ProductVariant',
            'vendure-customers': 'Customer',
            'vendure-orders': 'Order',
            'vendure-collections': 'Collection',
            'vendure-facets': 'Facet',
            'vendure-assets': 'Asset',
            'vendure-product-sync': 'Product',
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
    ): 'create' | 'update' | 'delete' | 'skip' | 'error' {
        const isEmpty = (obj: Record<string, unknown>) =>
            !obj || Object.keys(obj).length === 0;

        if (isEmpty(sample.before) && !isEmpty(sample.after)) {
            return 'create';
        }
        if (!isEmpty(sample.before) && isEmpty(sample.after)) {
            return 'delete';
        }
        if (isEmpty(sample.before) && isEmpty(sample.after)) {
            return 'skip';
        }
        return 'update';
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

    private findStep(definition: PipelineDefinition, stepKey: string): any | null {
        return (definition.steps || []).find(s => s.key === stepKey) || null;
    }

    private findStepByKey(definition: PipelineDefinition, stepKey: string): any | null {
        return this.findStep(definition, stepKey);
    }
}
