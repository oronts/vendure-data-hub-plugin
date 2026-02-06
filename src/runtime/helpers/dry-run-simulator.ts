import { RequestContext } from '@vendure/core';
import { PipelineDefinition, PipelineMetrics, JsonObject } from '../../types/index';
import { DataHubLogger } from '../../services/logger';
import { SANDBOX } from '../../constants/index';
import { RecordObject, OnRecordErrorCallback, ExecutorContext } from '../executor-types';
import { ExtractExecutor, TransformExecutor, LoadExecutor } from '../executors';
import { getAdapterCode } from '../../types/step-configs';

/**
 * Dry run simulation for pipeline steps
 */
export class DryRunSimulator {
    /** Max samples to collect per step in dry run */
    private readonly sampleLimit = SANDBOX.MAX_SAMPLES_PER_STEP;

    constructor(
        private extractExecutor: ExtractExecutor,
        private transformExecutor: TransformExecutor,
        private loadExecutor: LoadExecutor,
        private logger: DataHubLogger,
    ) {}

    /**
     * Execute a dry run of the pipeline
     * Returns metrics, details, and sample records showing before/after for transforms
     */
    async executeDryRun(
        ctx: RequestContext,
        definition: PipelineDefinition,
    ): Promise<{
        metrics: PipelineMetrics;
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>;
        errors?: string[];
    }> {
        const dryRunCtx = this.prepareDryRunContext(definition);
        const { executorCtx, errors } = dryRunCtx;

        const simResult = await this.simulateSteps(ctx, definition, executorCtx, dryRunCtx);

        return this.buildDryRunReport(simResult.processed, simResult.details, simResult.sampleRecords, errors);
    }

    /**
     * Prepare dry run context with empty checkpoint and error collection
     */
    private prepareDryRunContext(definition: PipelineDefinition): {
        executorCtx: ExecutorContext;
        errors: string[];
        onRecordError: OnRecordErrorCallback;
    } {
        const errors: string[] = [];
        const executorCtx: ExecutorContext = {
            cpData: {},
            cpDirty: false,
            markCheckpointDirty: () => {},
            errorHandling: definition?.context?.errorHandling,
            checkpointing: definition?.context?.checkpointing,
        };
        const onRecordError: OnRecordErrorCallback = async (stepKey: string, message: string) => {
            errors.push(`[${stepKey}] ${message}`);
        };
        return { executorCtx, errors, onRecordError };
    }

    /**
     * Simulate all pipeline steps for dry run
     */
    private async simulateSteps(
        ctx: RequestContext,
        definition: PipelineDefinition,
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
    ): Promise<{
        processed: number;
        details: JsonObject[];
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        let records: RecordObject[] = [];
        const details: JsonObject[] = [];
        const sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }> = [];
        let processed = 0;

        for (const step of definition.steps) {
            const stepResult = await this.simulateSingleStep(
                ctx, step, records, executorCtx, dryRunCtx, details,
            );
            records = stepResult.records;
            processed += stepResult.processedDelta;
            sampleRecords.push(...stepResult.samples);
        }

        return { processed, details, sampleRecords };
    }

    /** Result type for single step simulation */
    private noopStepResult(records: RecordObject[]) {
        return {
            records,
            processedDelta: 0,
            samples: [] as Array<{ step: string; before: RecordObject; after: RecordObject }>,
        };
    }

    /**
     * Simulate a single step in dry run - routes to type-specific handlers
     */
    private async simulateSingleStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        details: JsonObject[],
    ): Promise<{
        records: RecordObject[];
        processedDelta: number;
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        const handler = this.getStepSimulationHandler(step.type);
        if (handler) {
            return handler.call(this, ctx, step, records, executorCtx, dryRunCtx, details);
        }
        return this.handleUnknownStepType(step, records);
    }

    /** Handler function type for step simulation */
    private readonly stepSimulationHandlers: Record<string, (
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        details: JsonObject[],
    ) => Promise<{
        records: RecordObject[];
        processedDelta: number;
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }>> = {
        TRIGGER: this.handleTriggerSimulation.bind(this),
        EXTRACT: this.handleExtractSimulation.bind(this),
        TRANSFORM: this.handleTransformSimulation.bind(this),
        VALIDATE: this.handleValidateSimulation.bind(this),
        LOAD: this.handleLoadSimulation.bind(this),
        ENRICH: this.handleNoopSimulation.bind(this),
        ROUTE: this.handleNoopSimulation.bind(this),
        EXPORT: this.handleNoopSimulation.bind(this),
        FEED: this.handleNoopSimulation.bind(this),
        SINK: this.handleNoopSimulation.bind(this),
    };

    /**
     * Get the simulation handler for a given step type
     */
    private getStepSimulationHandler(stepType: string) {
        return this.stepSimulationHandlers[stepType] ?? null;
    }

    /** Handle trigger step simulation (no-op) */
    private async handleTriggerSimulation(
        _ctx: RequestContext,
        _step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        _executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        return this.noopStepResult(records);
    }

    /** Handle extract step simulation */
    private async handleExtractSimulation(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        _records: RecordObject[],
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        const result = await this.simulateExtractStep(ctx, step, executorCtx, dryRunCtx);
        return { records: result.records, processedDelta: result.processed, samples: result.samples };
    }

    /** Handle transform step simulation */
    private async handleTransformSimulation(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        const result = await this.simulateTransformStep(ctx, step, records, executorCtx, 'transform');
        return { records: result.records, processedDelta: 0, samples: result.samples };
    }

    /** Handle validate step simulation */
    private async handleValidateSimulation(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        _executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        const result = await this.simulateValidateStep(ctx, step, records);
        return { records: result.records, processedDelta: 0, samples: result.samples };
    }

    /** Handle load step simulation */
    private async handleLoadSimulation(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        _executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        details: JsonObject[],
    ) {
        await this.simulateLoadStep(ctx, step, records, details);
        return this.noopStepResult(records);
    }

    /** Handle steps that don't need simulation (enrich, route, export, feed, sink) */
    private async handleNoopSimulation(
        _ctx: RequestContext,
        _step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        _executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        return this.noopStepResult(records);
    }

    /** Handle unknown step types with logging */
    private handleUnknownStepType(
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
    ) {
        this.logger.debug(`executeDryRun: Step type "${step.type}" not handled in dry run simulation`, {
            stepKey: step.key,
            stepType: step.type,
        });
        return this.noopStepResult(records);
    }

    /**
     * Simulate extract step in dry run
     */
    private async simulateExtractStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
    ): Promise<{
        records: RecordObject[];
        processed: number;
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        const samples: Array<{ step: string; before: RecordObject; after: RecordObject }> = [];

        try {
            const out = await this.extractExecutor.execute(ctx, step, executorCtx, dryRunCtx.onRecordError);
            for (let i = 0; i < Math.min(out.length, this.sampleLimit); i++) {
                samples.push({ step: step.key || step.name || 'extract', before: {}, after: out[i] });
            }
            if (out.length === 0) {
                this.logger.debug('Dry run extract returned 0 records', {
                    stepKey: step.key,
                    adapterCode: getAdapterCode(step),
                });
            }
            return { records: out, processed: out.length, samples };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            dryRunCtx.errors.push(`[${step.key || 'extract'}] ${msg}`);
            this.logger.error('Dry run extract failed', err instanceof Error ? err : undefined, { stepKey: step.key });
            return { records: [], processed: 0, samples };
        }
    }

    /**
     * Simulate transform step in dry run
     */
    private async simulateTransformStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        executorCtx: ExecutorContext,
        stepLabel: string,
    ): Promise<{
        records: RecordObject[];
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        const beforeSamples = records.slice(0, this.sampleLimit).map(r => ({ ...r }));
        const transformed = await this.transformExecutor.executeOperator(ctx, step, records, executorCtx);
        const samples = this.collectSamplePairs(step, beforeSamples, transformed, stepLabel);
        return { records: transformed, samples };
    }

    /**
     * Simulate validate step in dry run
     */
    private async simulateValidateStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
    ): Promise<{
        records: RecordObject[];
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        const beforeSamples = records.slice(0, this.sampleLimit).map(r => ({ ...r }));
        const validated = await this.transformExecutor.executeValidate(ctx, step, records);
        const samples = this.collectSamplePairs(step, beforeSamples, validated, 'validate');
        return { records: validated, samples };
    }

    /**
     * Simulate load step in dry run
     */
    private async simulateLoadStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        details: JsonObject[],
    ): Promise<void> {
        const sim = await this.loadExecutor.simulate(ctx, step, records);
        const adapterCode = getAdapterCode(step);
        details.push({
            stepKey: step.key,
            ...(adapterCode ? { adapterCode } : {}),
            ...sim,
        });
    }

    /**
     * Collect before/after sample pairs for dry run reporting
     */
    private collectSamplePairs(
        step: PipelineDefinition['steps'][number],
        beforeSamples: RecordObject[],
        afterRecords: RecordObject[],
        stepLabel: string,
    ): Array<{ step: string; before: RecordObject; after: RecordObject }> {
        const samples: Array<{ step: string; before: RecordObject; after: RecordObject }> = [];
        for (let i = 0; i < Math.min(beforeSamples.length, afterRecords.length); i++) {
            samples.push({
                step: step.key || step.name || stepLabel,
                before: beforeSamples[i],
                after: afterRecords[i],
            });
        }
        return samples;
    }

    /**
     * Build the final dry run report with metrics
     */
    private buildDryRunReport(
        processed: number,
        details: JsonObject[],
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>,
        errors: string[],
    ): {
        metrics: PipelineMetrics;
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>;
        errors?: string[];
    } {
        return {
            metrics: {
                totalRecords: processed,
                processed,
                succeeded: processed,
                failed: errors.length,
                recordsProcessed: processed,
                recordsSucceeded: processed,
                recordsFailed: errors.length,
                recordsSkipped: 0,
                durationMs: 0,
                details,
            },
            sampleRecords,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
}
