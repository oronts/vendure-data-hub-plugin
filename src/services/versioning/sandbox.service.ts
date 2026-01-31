import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { Pipeline } from '../../entities/pipeline';
import { PipelineDefinition, PipelineStepDefinition } from '../../types/index';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import {
    LOGGER_CONTEXTS,
    SandboxStatus,
    SandboxStepStatus,
    RecordOutcome,
    FieldDiffChangeType,
    FieldChangeType,
    ValidationIssueSeverity,
    LineageOutcome,
    RecordProcessingState,
    SANDBOX,
} from '../../constants/index';
import { SandboxStepExecutor, DataLineageTracker } from './sandbox';

/**
 * Detailed step execution result for sandbox
 */
export interface StepExecutionResult {
    stepKey: string;
    stepType: string;
    stepName: string;
    status: SandboxStepStatus;
    recordsIn: number;
    recordsOut: number;
    recordsFiltered: number;
    recordsErrored: number;
    durationMs: number;
    errorMessage?: string;
    warnings: string[];
    samples: RecordSample[];
    fieldChanges: FieldChange[];
    validationIssues: ValidationIssue[];
}

export interface RecordSample {
    recordIndex: number;
    recordId: string | null;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    outcome: RecordOutcome;
    errorMessage?: string;
    fieldDiffs: FieldDiff[];
}

export interface FieldDiff {
    field: string;
    changeType: FieldDiffChangeType;
    beforeValue: unknown;
    afterValue: unknown;
    beforeType: string;
    afterType: string;
}

export interface FieldChange {
    field: string;
    changeType: FieldChangeType;
    affectedCount: number;
    totalRecords: number;
    percentage: number;
    sampleBefore: unknown[];
    sampleAfter: unknown[];
}

export interface ValidationIssue {
    recordIndex: number;
    recordId: string | null;
    field: string;
    rule: string;
    message: string;
    severity: ValidationIssueSeverity;
    value: unknown;
}

export interface LoadOperationPreview {
    entityType: string;
    adapterCode: string;
    operations: {
        create: LoadOperationDetail[];
        update: LoadOperationDetail[];
        delete: LoadOperationDetail[];
        skip: LoadOperationDetail[];
        error: LoadOperationDetail[];
    };
    summary: {
        createCount: number;
        updateCount: number;
        deleteCount: number;
        skipCount: number;
        errorCount: number;
    };
    warnings: string[];
}

export interface LoadOperationDetail {
    recordIndex: number;
    recordId: string | null;
    entityId: string | null;
    reason: string;
    data: Record<string, unknown>;
    existingData?: Record<string, unknown>;
    diff?: FieldDiff[];
}

export interface SandboxResult {
    status: SandboxStatus;
    totalDurationMs: number;
    steps: StepExecutionResult[];
    loadPreviews: LoadOperationPreview[];
    metrics: {
        totalRecordsProcessed: number;
        totalRecordsSucceeded: number;
        totalRecordsFailed: number;
        totalRecordsFiltered: number;
    };
    warnings: SandboxWarning[];
    errors: SandboxError[];
    dataLineage: RecordLineage[];
}

export interface SandboxWarning {
    stepKey: string;
    code: string;
    message: string;
    context?: Record<string, unknown>;
}

export interface SandboxError {
    stepKey: string;
    recordIndex?: number;
    code: string;
    message: string;
    stack?: string;
    context?: Record<string, unknown>;
}

export interface RecordLineage {
    recordIndex: number;
    originalRecordId: string | null;
    finalRecordId: string | null;
    finalOutcome: LineageOutcome;
    states: RecordState[];
}

export interface RecordState {
    stepKey: string;
    stepType: string;
    state: RecordProcessingState;
    data: Record<string, unknown>;
    timestamp: number;
    notes?: string;
}

export interface SandboxOptions {
    maxRecords?: number;
    maxSamplesPerStep?: number;
    includeLineage?: boolean;
    seedData?: Record<string, unknown>[];
    stopOnError?: boolean;
    timeoutMs?: number;
    skipSteps?: string[];
    startFromStep?: string;
}

const DEFAULT_SANDBOX_OPTIONS: Required<SandboxOptions> = {
    maxRecords: SANDBOX.MAX_RECORDS,
    maxSamplesPerStep: SANDBOX.MAX_SAMPLES_PER_STEP,
    includeLineage: true,
    seedData: [],
    stopOnError: false,
    timeoutMs: SANDBOX.DEFAULT_TIMEOUT_MS,
    skipSteps: [],
    startFromStep: '',
};

/**
 * Service for sandbox execution and impact preview.
 * Orchestrates helpers for step execution, lineage tracking, and load simulation.
 */
@Injectable()
export class SandboxService {
    private readonly logger: DataHubLogger;
    private readonly stepExecutor: SandboxStepExecutor;

    constructor(
        private connection: TransactionalConnection,
        private adapterRuntime: AdapterRuntimeService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
        this.stepExecutor = new SandboxStepExecutor(adapterRuntime);
    }

    /**
     * Execute a comprehensive sandbox run
     */
    async execute(ctx: RequestContext, pipelineId: ID, options: SandboxOptions = {}): Promise<SandboxResult> {
        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({ where: { id: pipelineId } });
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }
        return this.executeWithDefinition(ctx, pipeline.definition, options);
    }

    /**
     * Execute sandbox with a specific definition (for testing unpublished changes)
     */
    async executeWithDefinition(ctx: RequestContext, definition: PipelineDefinition, options: SandboxOptions = {}): Promise<SandboxResult> {
        const opts = { ...DEFAULT_SANDBOX_OPTIONS, ...options };
        const startTime = Date.now();
        const result = this.createInitialResult();
        const lineageTracker = new DataLineageTracker(opts);

        let records: Record<string, unknown>[] = opts.seedData.length > 0 ? [...opts.seedData] : [];

        try {
            const startIdx = this.findStartStepIndex(definition, opts);
            records = await this.processSteps(ctx, definition, startIdx, records, opts, lineageTracker, result, startTime);
            this.finalizeResult(result, opts, lineageTracker);
        } catch (error) {
            this.handleExecutionError(result, error);
        }

        result.totalDurationMs = Date.now() - startTime;
        this.logCompletion(result);
        return result;
    }

    private createInitialResult(): SandboxResult {
        return {
            status: SandboxStatus.SUCCESS,
            totalDurationMs: 0,
            steps: [],
            loadPreviews: [],
            metrics: { totalRecordsProcessed: 0, totalRecordsSucceeded: 0, totalRecordsFailed: 0, totalRecordsFiltered: 0 },
            warnings: [],
            errors: [],
            dataLineage: [],
        };
    }

    private findStartStepIndex(definition: PipelineDefinition, opts: Required<SandboxOptions>): number {
        if (!opts.startFromStep) return 0;

        const idx = definition.steps.findIndex(s => s.key === opts.startFromStep);
        if (idx === -1) throw new Error(`Step "${opts.startFromStep}" not found in pipeline`);
        if (opts.seedData.length === 0) throw new Error('Seed data is required when starting from a specific step');
        return idx;
    }

    private async processSteps(
        ctx: RequestContext,
        definition: PipelineDefinition,
        startIdx: number,
        records: Record<string, unknown>[],
        opts: Required<SandboxOptions>,
        lineageTracker: DataLineageTracker,
        result: SandboxResult,
        startTime: number,
    ): Promise<Record<string, unknown>[]> {
        for (let i = startIdx; i < definition.steps.length; i++) {
            const step = definition.steps[i];

            if (this.shouldTimeout(startTime, opts.timeoutMs)) {
                this.addTimeoutWarning(result, step.key, opts.timeoutMs);
                break;
            }

            if (opts.skipSteps.includes(step.key)) {
                result.steps.push(this.createSkippedStepResult(step, records.length));
                continue;
            }

            const stepResult = await this.stepExecutor.executeStep(ctx, step, records, opts, lineageTracker);
            result.steps.push(stepResult);
            if (stepResult.loadPreview) result.loadPreviews.push(stepResult.loadPreview);
            if (stepResult.outputRecords) records = stepResult.outputRecords;

            this.collectWarningsAndErrors(result, step.key, stepResult);
            this.updateMetrics(result, stepResult);

            if (stepResult.status === SandboxStepStatus.ERROR && opts.stopOnError) {
                result.status = SandboxStatus.ERROR;
                break;
            }
        }
        return records;
    }

    private shouldTimeout(startTime: number, timeoutMs: number): boolean {
        return Date.now() - startTime > timeoutMs;
    }

    private addTimeoutWarning(result: SandboxResult, stepKey: string, timeoutMs: number): void {
        result.warnings.push({ stepKey, code: 'TIMEOUT', message: `Sandbox execution timed out after ${timeoutMs}ms` });
        result.status = SandboxStatus.WARNING;
    }

    private createSkippedStepResult(step: PipelineStepDefinition, recordsCount: number): StepExecutionResult {
        return {
            stepKey: step.key,
            stepType: step.type,
            stepName: step.name || step.key,
            status: SandboxStepStatus.SKIPPED,
            recordsIn: recordsCount,
            recordsOut: recordsCount,
            recordsFiltered: 0,
            recordsErrored: 0,
            durationMs: 0,
            warnings: [],
            samples: [],
            fieldChanges: [],
            validationIssues: [],
        };
    }

    private collectWarningsAndErrors(result: SandboxResult, stepKey: string, stepResult: StepExecutionResult): void {
        stepResult.warnings.forEach(w => result.warnings.push({ stepKey, code: 'STEP_WARNING', message: w }));
        if (stepResult.status === SandboxStepStatus.ERROR) {
            result.errors.push({ stepKey, code: 'STEP_ERROR', message: stepResult.errorMessage || 'Unknown error' });
        }
    }

    private updateMetrics(result: SandboxResult, stepResult: StepExecutionResult): void {
        result.metrics.totalRecordsProcessed += stepResult.recordsIn;
        result.metrics.totalRecordsFiltered += stepResult.recordsFiltered;
        result.metrics.totalRecordsFailed += stepResult.recordsErrored;
    }

    private finalizeResult(result: SandboxResult, opts: Required<SandboxOptions>, lineageTracker: DataLineageTracker): void {
        if (opts.includeLineage) result.dataLineage = lineageTracker.getLineageRecords();
        result.metrics.totalRecordsSucceeded = result.metrics.totalRecordsProcessed - result.metrics.totalRecordsFailed - result.metrics.totalRecordsFiltered;
        if (result.errors.length > 0) result.status = SandboxStatus.ERROR;
        else if (result.warnings.length > 0) result.status = SandboxStatus.WARNING;
    }

    private handleExecutionError(result: SandboxResult, error: unknown): void {
        result.status = SandboxStatus.ERROR;
        result.errors.push({
            stepKey: 'sandbox',
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
    }

    private logCompletion(result: SandboxResult): void {
        this.logger.debug('Sandbox execution completed', {
            status: result.status,
            totalDurationMs: result.totalDurationMs,
            stepsExecuted: result.steps.length,
            errorsCount: result.errors.length,
            warningsCount: result.warnings.length,
        });
    }
}
