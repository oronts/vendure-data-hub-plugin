import { RequestContext } from '@vendure/core';
import { StepType, PipelineStepDefinition } from '../../../types/index';
import { AdapterRuntimeService } from '../../../runtime/adapter-runtime.service';
import {
    SandboxStepStatus,
    RecordOutcome,
    FieldDiffChangeType,
    RecordProcessingState,
    ValidationIssueSeverity,
    SandboxLoadResultType,
} from '../../../constants/enums';
import {
    StepExecutionResult,
    RecordSample,
    LoadOperationPreview,
    ValidationIssue,
    SandboxOptions,
} from '../sandbox.service';
import { FieldDiffCalculator } from './field-diff-calculator';
import { DataLineageTracker } from './data-lineage-tracker';
import { LoadOperationSimulator } from './load-operation-simulator';

/**
 * Helper for executing individual pipeline steps in sandbox mode
 */
export class SandboxStepExecutor {
    private readonly fieldDiffCalculator = new FieldDiffCalculator();
    private readonly loadSimulator = new LoadOperationSimulator();

    constructor(private readonly adapterRuntime: AdapterRuntimeService) {}

    /**
     * Execute a single step and return detailed results
     */
    async executeStep(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        inputRecords: Record<string, unknown>[],
        opts: Required<SandboxOptions>,
        lineageTracker: DataLineageTracker,
    ): Promise<StepExecutionResult & { outputRecords?: Record<string, unknown>[]; loadPreview?: LoadOperationPreview }> {
        const stepStart = Date.now();
        const stepKey = step.key || step.name || 'unknown';
        const stepType = step.type;

        const execution = this.createInitialExecution(stepKey, stepType, step.name, inputRecords.length);
        let outputRecords: Record<string, unknown>[] = [];
        let loadPreview: LoadOperationPreview | undefined;

        try {
            const result = await this.dispatchStepExecution(ctx, step, stepKey, stepType, inputRecords, opts, lineageTracker, execution);
            outputRecords = result.outputRecords;
            loadPreview = result.loadPreview;
        } catch (error) {
            this.handleStepError(execution, error, inputRecords.length);
        }

        execution.durationMs = Date.now() - stepStart;
        return { ...execution, outputRecords, loadPreview };
    }

    /**
     * Create initial step execution result
     */
    private createInitialExecution(stepKey: string, stepType: string, stepName: string | undefined, recordsIn: number): StepExecutionResult {
        return {
            stepKey,
            stepType,
            stepName: stepName || stepKey,
            status: SandboxStepStatus.SUCCESS,
            recordsIn,
            recordsOut: 0,
            recordsFiltered: 0,
            recordsErrored: 0,
            durationMs: 0,
            warnings: [],
            samples: [],
            fieldChanges: [],
            validationIssues: [],
        };
    }

    /**
     * Dispatch to appropriate step handler
     */
    private async dispatchStepExecution(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        stepKey: string,
        stepType: string,
        inputRecords: Record<string, unknown>[],
        opts: Required<SandboxOptions>,
        lineageTracker: DataLineageTracker,
        execution: StepExecutionResult,
    ): Promise<{ outputRecords: Record<string, unknown>[]; loadPreview?: LoadOperationPreview }> {
        switch (stepType) {
            case StepType.TRIGGER:
                execution.recordsOut = inputRecords.length;
                return { outputRecords: inputRecords };

            case StepType.EXTRACT:
                return { outputRecords: await this.executeExtract(ctx, step, stepKey, stepType, opts, execution, lineageTracker) };

            case StepType.TRANSFORM:
            case StepType.VALIDATE:
                return { outputRecords: await this.executeTransform(ctx, step, stepKey, stepType, inputRecords, opts, execution, lineageTracker) };

            case StepType.LOAD:
                return this.executeLoad(ctx, step, stepKey, stepType, inputRecords, opts, execution, lineageTracker);

            default:
                execution.recordsOut = inputRecords.length;
                execution.warnings.push(`Step type "${stepType}" not fully simulated in sandbox`);
                return { outputRecords: inputRecords };
        }
    }

    /**
     * Execute EXTRACT step in sandbox mode
     */
    private async executeExtract(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        stepKey: string,
        stepType: string,
        opts: Required<SandboxOptions>,
        execution: StepExecutionResult,
        lineageTracker: DataLineageTracker,
    ): Promise<Record<string, unknown>[]> {
        const dryRunResult = await this.adapterRuntime.executeDryRun(ctx, { version: 1, steps: [step] });

        const outputRecords = dryRunResult.sampleRecords
            .filter(s => s.step === stepKey)
            .map(s => s.after)
            .slice(0, opts.maxRecords);

        lineageTracker.initialize(outputRecords);
        this.trackExtractedRecords(outputRecords, stepKey, stepType, lineageTracker);
        execution.samples = this.createExtractSamples(outputRecords, opts.maxSamplesPerStep, lineageTracker);
        execution.recordsOut = outputRecords.length;
        execution.fieldChanges = this.fieldDiffCalculator.aggregateFieldChanges(execution.samples);

        return outputRecords;
    }

    /**
     * Track extracted records in lineage
     */
    private trackExtractedRecords(records: Record<string, unknown>[], stepKey: string, stepType: string, lineageTracker: DataLineageTracker): void {
        records.forEach((rec, idx) => {
            lineageTracker.trackState(stepKey, stepType, idx, RecordProcessingState.ENTERING, rec);
            lineageTracker.trackState(stepKey, stepType, idx, RecordProcessingState.TRANSFORMED, rec, 'Extracted from source');
        });
    }

    /**
     * Create samples for extract step
     */
    private createExtractSamples(records: Record<string, unknown>[], maxSamples: number, lineageTracker: DataLineageTracker): RecordSample[] {
        return records.slice(0, maxSamples).map((rec, idx) => ({
            recordIndex: idx,
            recordId: lineageTracker.extractRecordId(rec),
            before: {},
            after: rec,
            outcome: RecordOutcome.SUCCESS,
            fieldDiffs: Object.keys(rec).map(field => ({
                field,
                changeType: FieldDiffChangeType.ADDED,
                beforeValue: undefined,
                afterValue: rec[field],
                beforeType: 'undefined',
                afterType: typeof rec[field],
            })),
        }));
    }

    /**
     * Execute TRANSFORM or VALIDATE step in sandbox mode
     */
    private async executeTransform(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        stepKey: string,
        stepType: string,
        inputRecords: Record<string, unknown>[],
        opts: Required<SandboxOptions>,
        execution: StepExecutionResult,
        lineageTracker: DataLineageTracker,
    ): Promise<Record<string, unknown>[]> {
        inputRecords.forEach((rec, idx) => lineageTracker.trackState(stepKey, stepType, idx, RecordProcessingState.ENTERING, rec));

        const dryRunResult = await this.adapterRuntime.executeDryRun(ctx, {
            version: 1,
            steps: [{ key: 'seed', type: StepType.EXTRACT, config: { adapterCode: 'seed' } }, step],
        });

        let outputRecords = dryRunResult.sampleRecords.filter(s => s.step === stepKey).map(s => s.after as Record<string, unknown>);
        if (outputRecords.length === 0) outputRecords = [...inputRecords];

        const samples = this.createTransformSamples(inputRecords, outputRecords, stepKey, stepType, opts, lineageTracker);

        execution.samples = samples;
        execution.recordsOut = outputRecords.length;
        execution.recordsFiltered = Math.max(0, inputRecords.length - outputRecords.length);
        execution.fieldChanges = this.fieldDiffCalculator.aggregateFieldChanges(samples);

        if (stepType === StepType.VALIDATE) {
            execution.validationIssues = this.extractValidationIssues(step, samples);
        }

        return outputRecords;
    }

    /**
     * Create samples for transform step
     */
    private createTransformSamples(
        beforeRecords: Record<string, unknown>[],
        afterRecords: Record<string, unknown>[],
        stepKey: string,
        stepType: string,
        opts: Required<SandboxOptions>,
        lineageTracker: DataLineageTracker,
    ): RecordSample[] {
        const samples: RecordSample[] = [];
        for (let i = 0; i < Math.min(beforeRecords.length, opts.maxSamplesPerStep); i++) {
            const before = beforeRecords[i];
            const after = afterRecords[i] || before;
            const fieldDiffs = this.fieldDiffCalculator.computeFieldDiffs(before, after);
            const outcome = this.fieldDiffCalculator.determineOutcome(before, after, fieldDiffs);

            samples.push({
                recordIndex: i,
                recordId: lineageTracker.extractRecordId(after) || lineageTracker.extractRecordId(before),
                before, after, outcome, fieldDiffs,
            });

            lineageTracker.trackState(
                stepKey,
                stepType,
                i,
                outcome === RecordOutcome.FILTERED ? RecordProcessingState.FILTERED : RecordProcessingState.TRANSFORMED,
                after,
            );
        }
        return samples;
    }

    /**
     * Execute LOAD step in sandbox mode
     */
    private async executeLoad(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        stepKey: string,
        stepType: string,
        inputRecords: Record<string, unknown>[],
        opts: Required<SandboxOptions>,
        execution: StepExecutionResult,
        lineageTracker: DataLineageTracker,
    ): Promise<{ outputRecords: Record<string, unknown>[]; loadPreview: LoadOperationPreview }> {
        const loadPreview = await this.loadSimulator.simulateLoadOperations(ctx, step, inputRecords, opts);

        this.trackLoadOperations(inputRecords, loadPreview, stepKey, stepType, lineageTracker);

        execution.recordsOut = inputRecords.length - loadPreview.summary.errorCount - loadPreview.summary.skipCount;
        execution.recordsFiltered = loadPreview.summary.skipCount;
        execution.recordsErrored = loadPreview.summary.errorCount;
        execution.warnings = loadPreview.warnings;
        execution.samples = this.createLoadSamples(loadPreview, opts.maxSamplesPerStep);

        return { outputRecords: inputRecords, loadPreview };
    }

    /**
     * Track load operations in lineage
     */
    private trackLoadOperations(
        inputRecords: Record<string, unknown>[],
        loadPreview: LoadOperationPreview,
        stepKey: string,
        stepType: string,
        lineageTracker: DataLineageTracker,
    ): void {
        inputRecords.forEach((rec, idx) => {
            lineageTracker.trackState(stepKey, stepType, idx, RecordProcessingState.ENTERING, rec);
            const isError = loadPreview.operations.error.some(o => o.recordIndex === idx);
            const isSkip = loadPreview.operations.skip.some(o => o.recordIndex === idx);
            const isCreate = loadPreview.operations.create.some(o => o.recordIndex === idx);

            if (isError) lineageTracker.trackState(stepKey, stepType, idx, RecordProcessingState.ERROR, rec, 'Load error');
            else if (isSkip) lineageTracker.trackState(stepKey, stepType, idx, RecordProcessingState.FILTERED, rec, 'Skipped by loader');
            else lineageTracker.trackState(stepKey, stepType, idx, RecordProcessingState.TRANSFORMED, rec, isCreate ? 'Will create' : 'Will update');
        });
    }

    /**
     * Create samples from load preview
     */
    private createLoadSamples(preview: LoadOperationPreview, maxSamples: number): RecordSample[] {
        const allOps = [
            ...preview.operations.create.map(o => ({ ...o, op: SandboxLoadResultType.CREATE })),
            ...preview.operations.update.map(o => ({ ...o, op: SandboxLoadResultType.UPDATE })),
            ...preview.operations.error.map(o => ({ ...o, op: SandboxLoadResultType.ERROR })),
            ...preview.operations.skip.map(o => ({ ...o, op: SandboxLoadResultType.SKIP })),
        ];

        return allOps.slice(0, maxSamples).map(op => ({
            recordIndex: op.recordIndex,
            recordId: op.recordId,
            before: op.data,
            after: op.data,
            outcome: op.op === SandboxLoadResultType.ERROR
                ? RecordOutcome.ERROR
                : op.op === SandboxLoadResultType.SKIP
                    ? RecordOutcome.FILTERED
                    : RecordOutcome.SUCCESS,
            errorMessage: op.op === SandboxLoadResultType.ERROR ? op.reason : undefined,
            fieldDiffs: op.diff || [],
        }));
    }

    /**
     * Extract validation issues from a validate step
     */
    private extractValidationIssues(step: PipelineStepDefinition, samples: RecordSample[]): ValidationIssue[] {
        return samples
            .filter(s => s.outcome === RecordOutcome.FILTERED || s.outcome === RecordOutcome.ERROR)
            .map(sample => ({
                recordIndex: sample.recordIndex,
                recordId: sample.recordId,
                field: '_record',
                rule: 'validation',
                message: sample.errorMessage || 'Record failed validation',
                severity: ValidationIssueSeverity.ERROR,
                value: sample.before,
            }));
    }

    /**
     * Handle step execution error
     */
    private handleStepError(execution: StepExecutionResult, error: unknown, recordCount: number): void {
        execution.status = SandboxStepStatus.ERROR;
        execution.errorMessage = error instanceof Error ? error.message : String(error);
        execution.recordsErrored = recordCount;
    }
}
