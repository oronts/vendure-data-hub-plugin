import { RequestContext } from '@vendure/core';
import { PipelineDefinition, PipelineMetrics, JsonObject } from '../../types/index';
import { DataHubLogger } from '../../services/logger';
import { SANDBOX } from '../../constants/index';
import { BranchOutput, RecordObject, OnRecordErrorCallback, ExecutorContext, isBranchOutput } from '../executor-types';
import { ExtractExecutor, TransformExecutor, LoadExecutor } from '../executors';
import { getAdapterCode } from '../../types/step-configs';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { executeDryRunGraph } from './dry-run-graph';

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
        recordLimit: number = SANDBOX.MAX_RECORDS,
    ): Promise<{
        metrics: PipelineMetrics;
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>;
        errors?: string[];
    }> {
        const dryRunCtx = this.prepareDryRunContext(definition, recordLimit);
        const { executorCtx, errors } = dryRunCtx;

        const simResult = await this.simulateSteps(ctx, definition, executorCtx, dryRunCtx);

        return this.buildDryRunReport(simResult.processed, simResult.details, simResult.sampleRecords, errors);
    }

    /**
     * Prepare dry run context with empty checkpoint and error collection
     */
    private prepareDryRunContext(definition: PipelineDefinition, recordLimit: number): {
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
            recordLimit,
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
        const details: JsonObject[] = [];
        if ((definition.edges?.length ?? 0) > 0) {
            const result = await executeDryRunGraph(definition, (step, input) => (
                this.simulateSingleStep(ctx, step, input, executorCtx, dryRunCtx, details, true)
            ));
            return { processed: result.processed, details, sampleRecords: result.samples };
        }

        let records: RecordObject[] = [];
        const sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }> = [];
        let processed = 0;
        for (const step of definition.steps) {
            const stepResult = await this.simulateSingleStep(
                ctx, step, records, executorCtx, dryRunCtx, details, false,
            );
            records = isBranchOutput(stepResult.output)
                ? Object.values(stepResult.output.branches).flat()
                : stepResult.output;
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
        graphMode: boolean,
    ): Promise<{
        output: RecordObject[] | BranchOutput;
        processedDelta: number;
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        if (step.type === 'ROUTE') {
            return this.simulateRouteStep(ctx, step, records, details, graphMode);
        }
        const handler = this.getStepSimulationHandler(step.type);
        if (handler) {
            const result = await handler.call(this, ctx, step, records, executorCtx, dryRunCtx, details);
            return { ...result, output: result.records };
        }
        const result = this.handleUnknownStepType(step, records);
        return { ...result, output: result.records };
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
        EXPORT: this.handleNoopSimulation.bind(this),
        FEED: this.handleNoopSimulation.bind(this),
        SINK: this.handleNoopSimulation.bind(this),
        GATE: this.handleNoopSimulation.bind(this),
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

    private async simulateRouteStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        details: JsonObject[],
        graphMode: boolean,
    ): Promise<{
        output: RecordObject[] | BranchOutput;
        processedDelta: number;
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        if (!graphMode) {
            const output = await this.transformExecutor.executeRoute(ctx, step, records);
            return { output, processedDelta: 0, samples: [] };
        }

        const output = await this.transformExecutor.executeRouteBranches(ctx, step, records);
        const branchCounts = Object.fromEntries(
            Object.entries(output.branches).map(([branch, branchRecords]) => [branch, branchRecords.length]),
        );
        details.push({
            stepKey: step.key,
            ...(getAdapterCode(step) ? { adapterCode: getAdapterCode(step) } : {}),
            recordsIn: records.length,
            recordsOut: Object.values(branchCounts).reduce((total, count) => total + count, 0),
            branches: branchCounts,
        });
        return { output, processedDelta: 0, samples: [] };
    }

    /** Handle steps that don't produce dry-run side effects */
    private async handleNoopSimulation(
        _ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        _executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        details: JsonObject[],
    ) {
        details.push({
            stepKey: step.key,
            stepType: step.type,
            recordsIn: records.length,
            recordsOut: records.length,
            simulation: 'SKIPPED',
            warning: `${step.type} side effects are not executed during dry run`,
        });
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
            const msg = getErrorMessage(err);
            dryRunCtx.errors.push(`[${step.key || 'extract'}] ${msg}`);
            this.logger.error('Dry run extract failed', toErrorOrUndefined(err), { stepKey: step.key });
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
        const skipped = details.reduce((total, detail) => {
            const skippedRecords = detail['simulation'] === 'SKIPPED'
                && typeof detail['recordsIn'] === 'number'
                ? detail['recordsIn']
                : 0;
            return total + skippedRecords;
        }, 0);

        return {
            metrics: {
                totalRecords: processed,
                processed,
                succeeded: Math.max(0, processed - errors.length),
                failed: Math.min(errors.length, processed),
                skipped,
                recordsProcessed: processed,
                recordsSucceeded: Math.max(0, processed - errors.length),
                recordsFailed: Math.min(errors.length, processed),
                recordsSkipped: skipped,
                durationMs: 0,
                details,
            },
            sampleRecords,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
}
