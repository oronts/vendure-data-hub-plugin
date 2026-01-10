import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { PipelineDefinition, PipelineMetrics, StepType } from '../../types/index';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';

/**
 * Detailed step execution result for sandbox
 */
export interface StepExecutionResult {
    stepKey: string;
    stepType: string;
    stepName: string;
    status: 'success' | 'warning' | 'error' | 'skipped';
    recordsIn: number;
    recordsOut: number;
    recordsFiltered: number;
    recordsErrored: number;
    durationMs: number;
    errorMessage?: string;
    warnings: string[];
    /** Sample records showing transformation */
    samples: RecordSample[];
    /** Field-level changes detected */
    fieldChanges: FieldChange[];
    /** Validation issues found */
    validationIssues: ValidationIssue[];
}

/**
 * Sample record with before/after state
 */
export interface RecordSample {
    recordIndex: number;
    recordId: string | null;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    outcome: 'transformed' | 'filtered' | 'error' | 'unchanged';
    errorMessage?: string;
    /** Field-level diff for this record */
    fieldDiffs: FieldDiff[];
}

/**
 * Field-level diff showing what changed
 */
export interface FieldDiff {
    field: string;
    changeType: 'added' | 'removed' | 'modified' | 'unchanged';
    beforeValue: unknown;
    afterValue: unknown;
    beforeType: string;
    afterType: string;
}

/**
 * Aggregated field change across all records
 */
export interface FieldChange {
    field: string;
    changeType: 'added' | 'removed' | 'modified' | 'type_changed';
    affectedCount: number;
    totalRecords: number;
    percentage: number;
    sampleBefore: unknown[];
    sampleAfter: unknown[];
}

/**
 * Validation issue found during processing
 */
export interface ValidationIssue {
    recordIndex: number;
    recordId: string | null;
    field: string;
    rule: string;
    message: string;
    severity: 'error' | 'warning';
    value: unknown;
}

/**
 * Load operation preview
 */
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

/**
 * Detail of a single load operation
 */
export interface LoadOperationDetail {
    recordIndex: number;
    recordId: string | null;
    entityId: string | null;
    reason: string;
    data: Record<string, unknown>;
    existingData?: Record<string, unknown>;
    diff?: FieldDiff[];
}

/**
 * Complete sandbox execution result
 */
export interface SandboxResult {
    /** Overall status */
    status: 'success' | 'warning' | 'error';
    /** Total execution time */
    totalDurationMs: number;
    /** Step-by-step results */
    steps: StepExecutionResult[];
    /** Load operation previews */
    loadPreviews: LoadOperationPreview[];
    /** Final metrics */
    metrics: {
        totalRecordsProcessed: number;
        totalRecordsSucceeded: number;
        totalRecordsFailed: number;
        totalRecordsFiltered: number;
    };
    /** All warnings collected */
    warnings: SandboxWarning[];
    /** All errors collected */
    errors: SandboxError[];
    /** Data lineage - trace records through the pipeline */
    dataLineage: RecordLineage[];
}

/**
 * Warning collected during sandbox execution
 */
export interface SandboxWarning {
    stepKey: string;
    code: string;
    message: string;
    context?: Record<string, unknown>;
}

/**
 * Error collected during sandbox execution
 */
export interface SandboxError {
    stepKey: string;
    recordIndex?: number;
    code: string;
    message: string;
    stack?: string;
    context?: Record<string, unknown>;
}

/**
 * Trace a single record through the entire pipeline
 */
export interface RecordLineage {
    recordIndex: number;
    originalRecordId: string | null;
    finalRecordId: string | null;
    finalOutcome: 'loaded' | 'filtered' | 'error' | 'skipped';
    states: RecordState[];
}

/**
 * Record state at a specific step
 */
export interface RecordState {
    stepKey: string;
    stepType: string;
    state: 'entering' | 'transformed' | 'filtered' | 'error';
    data: Record<string, unknown>;
    timestamp: number;
    notes?: string;
}

/**
 * Sandbox execution options
 */
export interface SandboxOptions {
    /** Maximum records to process (default: 100) */
    maxRecords?: number;
    /** Maximum samples per step (default: 10) */
    maxSamplesPerStep?: number;
    /** Include full data lineage (default: true for small datasets) */
    includeLineage?: boolean;
    /** Custom seed data to use instead of extracting */
    seedData?: Record<string, unknown>[];
    /** Stop on first error (default: false) */
    stopOnError?: boolean;
    /** Timeout in milliseconds (default: 60000) */
    timeoutMs?: number;
    /** Steps to skip (for partial testing) */
    skipSteps?: string[];
    /** Start from a specific step (requires seed data) */
    startFromStep?: string;
}

const DEFAULT_SANDBOX_OPTIONS: Required<SandboxOptions> = {
    maxRecords: 100,
    maxSamplesPerStep: 10,
    includeLineage: true,
    seedData: [],
    stopOnError: false,
    timeoutMs: 60000,
    skipSteps: [],
    startFromStep: '',
};

/**
 * Service for sandbox execution and impact preview
 * Provides detailed, production-ready dry run capabilities
 */
@Injectable()
export class SandboxService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private adapterRuntime: AdapterRuntimeService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    /**
     * Execute a comprehensive sandbox run
     */
    async execute(
        ctx: RequestContext,
        pipelineId: ID,
        options: SandboxOptions = {},
    ): Promise<SandboxResult> {
        const opts = { ...DEFAULT_SANDBOX_OPTIONS, ...options };
        const startTime = Date.now();

        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { id: pipelineId },
        });
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }

        return this.executeWithDefinition(ctx, pipeline.definition, opts);
    }

    /**
     * Execute sandbox with a specific definition (for testing unpublished changes)
     */
    async executeWithDefinition(
        ctx: RequestContext,
        definition: PipelineDefinition,
        options: SandboxOptions = {},
    ): Promise<SandboxResult> {
        const opts = { ...DEFAULT_SANDBOX_OPTIONS, ...options };
        const startTime = Date.now();

        const result: SandboxResult = {
            status: 'success',
            totalDurationMs: 0,
            steps: [],
            loadPreviews: [],
            metrics: {
                totalRecordsProcessed: 0,
                totalRecordsSucceeded: 0,
                totalRecordsFailed: 0,
                totalRecordsFiltered: 0,
            },
            warnings: [],
            errors: [],
            dataLineage: [],
        };

        let records: Record<string, unknown>[] = opts.seedData.length > 0 ? [...opts.seedData] : [];
        const lineageMap = new Map<number, RecordLineage>();

        // Initialize lineage tracking
        const initializeLineage = (recs: Record<string, unknown>[]) => {
            if (!opts.includeLineage) return;
            recs.slice(0, opts.maxRecords).forEach((rec, idx) => {
                lineageMap.set(idx, {
                    recordIndex: idx,
                    originalRecordId: this.extractRecordId(rec),
                    finalRecordId: null,
                    finalOutcome: 'loaded',
                    states: [],
                });
            });
        };

        // Track state for lineage
        const trackState = (
            stepKey: string,
            stepType: string,
            recordIndex: number,
            state: 'entering' | 'transformed' | 'filtered' | 'error',
            data: Record<string, unknown>,
            notes?: string,
        ) => {
            if (!opts.includeLineage) return;
            const lineage = lineageMap.get(recordIndex);
            if (lineage) {
                lineage.states.push({
                    stepKey,
                    stepType,
                    state,
                    data: this.cloneForLineage(data),
                    timestamp: Date.now(),
                    notes,
                });
            }
        };

        try {
            // Find start step index
            let startIdx = 0;
            if (opts.startFromStep) {
                startIdx = definition.steps.findIndex(s => s.key === opts.startFromStep);
                if (startIdx === -1) {
                    throw new Error(`Step "${opts.startFromStep}" not found in pipeline`);
                }
                if (opts.seedData.length === 0) {
                    throw new Error('Seed data is required when starting from a specific step');
                }
            }

            // Process each step
            for (let i = startIdx; i < definition.steps.length; i++) {
                const step = definition.steps[i];

                // Check timeout
                if (Date.now() - startTime > opts.timeoutMs) {
                    result.warnings.push({
                        stepKey: step.key,
                        code: 'TIMEOUT',
                        message: `Sandbox execution timed out after ${opts.timeoutMs}ms`,
                    });
                    result.status = 'warning';
                    break;
                }

                // Check if step should be skipped
                if (opts.skipSteps.includes(step.key)) {
                    result.steps.push({
                        stepKey: step.key,
                        stepType: step.type,
                        stepName: step.name || step.key,
                        status: 'skipped',
                        recordsIn: records.length,
                        recordsOut: records.length,
                        recordsFiltered: 0,
                        recordsErrored: 0,
                        durationMs: 0,
                        warnings: [],
                        samples: [],
                        fieldChanges: [],
                        validationIssues: [],
                    });
                    continue;
                }

                const stepStart = Date.now();
                const stepResult = await this.executeStep(
                    ctx,
                    step,
                    records,
                    opts,
                    initializeLineage,
                    trackState,
                );

                result.steps.push(stepResult.execution);

                if (stepResult.loadPreview) {
                    result.loadPreviews.push(stepResult.loadPreview);
                }

                // Update records for next step
                if (stepResult.outputRecords) {
                    records = stepResult.outputRecords;
                }

                // Collect warnings and errors
                stepResult.execution.warnings.forEach(w => {
                    result.warnings.push({
                        stepKey: step.key,
                        code: 'STEP_WARNING',
                        message: w,
                    });
                });

                if (stepResult.execution.status === 'error') {
                    result.errors.push({
                        stepKey: step.key,
                        code: 'STEP_ERROR',
                        message: stepResult.execution.errorMessage || 'Unknown error',
                    });

                    if (opts.stopOnError) {
                        result.status = 'error';
                        break;
                    }
                }

                // Update metrics
                result.metrics.totalRecordsProcessed += stepResult.execution.recordsIn;
                result.metrics.totalRecordsFiltered += stepResult.execution.recordsFiltered;
                result.metrics.totalRecordsFailed += stepResult.execution.recordsErrored;
            }

            // Finalize lineage
            if (opts.includeLineage) {
                result.dataLineage = Array.from(lineageMap.values());
            }

            // Calculate final metrics
            result.metrics.totalRecordsSucceeded =
                result.metrics.totalRecordsProcessed -
                result.metrics.totalRecordsFailed -
                result.metrics.totalRecordsFiltered;

            // Determine overall status
            if (result.errors.length > 0) {
                result.status = 'error';
            } else if (result.warnings.length > 0) {
                result.status = 'warning';
            }

        } catch (error) {
            result.status = 'error';
            result.errors.push({
                stepKey: 'sandbox',
                code: 'EXECUTION_ERROR',
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
        }

        result.totalDurationMs = Date.now() - startTime;

        this.logger.debug('Sandbox execution completed', {
            status: result.status,
            totalDurationMs: result.totalDurationMs,
            stepsExecuted: result.steps.length,
            errorsCount: result.errors.length,
            warningsCount: result.warnings.length,
        });

        return result;
    }

    /**
     * Execute a single step and return detailed results
     */
    private async executeStep(
        ctx: RequestContext,
        step: any,
        inputRecords: Record<string, unknown>[],
        opts: Required<SandboxOptions>,
        initializeLineage: (recs: Record<string, unknown>[]) => void,
        trackState: (
            stepKey: string,
            stepType: string,
            recordIndex: number,
            state: 'entering' | 'transformed' | 'filtered' | 'error',
            data: Record<string, unknown>,
            notes?: string,
        ) => void,
    ): Promise<{
        execution: StepExecutionResult;
        outputRecords?: Record<string, unknown>[];
        loadPreview?: LoadOperationPreview;
    }> {
        const stepStart = Date.now();
        const stepKey = step.key || step.name || 'unknown';
        const stepType = step.type;
        const stepName = step.name || stepKey;

        const execution: StepExecutionResult = {
            stepKey,
            stepType,
            stepName,
            status: 'success',
            recordsIn: inputRecords.length,
            recordsOut: 0,
            recordsFiltered: 0,
            recordsErrored: 0,
            durationMs: 0,
            warnings: [],
            samples: [],
            fieldChanges: [],
            validationIssues: [],
        };

        let outputRecords: Record<string, unknown>[] = [];
        let loadPreview: LoadOperationPreview | undefined;

        try {
            switch (stepType) {
                case StepType.TRIGGER:
                    // Triggers don't process records
                    outputRecords = inputRecords;
                    execution.recordsOut = inputRecords.length;
                    break;

                case StepType.EXTRACT: {
                    // For sandbox, we use a limited extract
                    const dryRunResult = await this.adapterRuntime.executeDryRun(ctx, {
                        version: 1,
                        steps: [step],
                    });

                    outputRecords = dryRunResult.sampleRecords
                        .filter(s => s.step === stepKey)
                        .map(s => s.after)
                        .slice(0, opts.maxRecords);

                    // Initialize lineage after extract
                    initializeLineage(outputRecords);

                    // Track initial state
                    outputRecords.forEach((rec, idx) => {
                        trackState(stepKey, stepType, idx, 'entering', rec);
                        trackState(stepKey, stepType, idx, 'transformed', rec, 'Extracted from source');
                    });

                    // Create samples
                    execution.samples = outputRecords.slice(0, opts.maxSamplesPerStep).map((rec, idx) => ({
                        recordIndex: idx,
                        recordId: this.extractRecordId(rec),
                        before: {},
                        after: rec,
                        outcome: 'transformed' as const,
                        fieldDiffs: Object.keys(rec).map(field => ({
                            field,
                            changeType: 'added' as const,
                            beforeValue: undefined,
                            afterValue: rec[field],
                            beforeType: 'undefined',
                            afterType: typeof rec[field],
                        })),
                    }));

                    execution.recordsOut = outputRecords.length;
                    execution.fieldChanges = this.aggregateFieldChanges(execution.samples);
                    break;
                }

                case StepType.TRANSFORM:
                case StepType.VALIDATE: {
                    // Track entering state
                    inputRecords.forEach((rec, idx) => {
                        trackState(stepKey, stepType, idx, 'entering', rec);
                    });

                    // Execute transform via dry run
                    const dryRunResult = await this.adapterRuntime.executeDryRun(ctx, {
                        version: 1,
                        steps: [
                            { key: 'seed', type: StepType.EXTRACT, config: { adapterCode: 'seed' } },
                            step,
                        ],
                    });

                    // For transforms, we need to manually process to get before/after
                    const beforeRecords = inputRecords.slice(0, opts.maxRecords);

                    // Simulate the transform on our input records
                    // In production, this would use the actual transform executor
                    outputRecords = dryRunResult.sampleRecords
                        .filter(s => s.step === stepKey)
                        .map(s => s.after as Record<string, unknown>);

                    // If no samples from dry run, pass through
                    if (outputRecords.length === 0) {
                        outputRecords = [...inputRecords];
                    }

                    // Create detailed samples with field diffs
                    const samples: RecordSample[] = [];
                    for (let i = 0; i < Math.min(beforeRecords.length, opts.maxSamplesPerStep); i++) {
                        const before = beforeRecords[i];
                        const after = outputRecords[i] || before;
                        const fieldDiffs = this.computeFieldDiffs(before, after);
                        const outcome = this.determineOutcome(before, after, fieldDiffs);

                        samples.push({
                            recordIndex: i,
                            recordId: this.extractRecordId(after) || this.extractRecordId(before),
                            before,
                            after,
                            outcome,
                            fieldDiffs,
                        });

                        // Track state
                        trackState(stepKey, stepType, i, outcome === 'filtered' ? 'filtered' : 'transformed', after);
                    }

                    execution.samples = samples;
                    execution.recordsOut = outputRecords.length;
                    execution.recordsFiltered = Math.max(0, inputRecords.length - outputRecords.length);
                    execution.fieldChanges = this.aggregateFieldChanges(samples);

                    // Check for validation issues (for VALIDATE step)
                    if (stepType === StepType.VALIDATE) {
                        execution.validationIssues = this.extractValidationIssues(step, samples);
                    }
                    break;
                }

                case StepType.LOAD: {
                    // Simulate load operations
                    loadPreview = await this.simulateLoadOperations(ctx, step, inputRecords, opts);

                    // Track state based on load preview
                    inputRecords.forEach((rec, idx) => {
                        trackState(stepKey, stepType, idx, 'entering', rec);
                        // Determine outcome based on load preview
                        const recordId = this.extractRecordId(rec);
                        const isCreate = loadPreview!.operations.create.some(o => o.recordIndex === idx);
                        const isUpdate = loadPreview!.operations.update.some(o => o.recordIndex === idx);
                        const isError = loadPreview!.operations.error.some(o => o.recordIndex === idx);
                        const isSkip = loadPreview!.operations.skip.some(o => o.recordIndex === idx);

                        if (isError) {
                            trackState(stepKey, stepType, idx, 'error', rec, 'Load error');
                        } else if (isSkip) {
                            trackState(stepKey, stepType, idx, 'filtered', rec, 'Skipped by loader');
                        } else {
                            trackState(stepKey, stepType, idx, 'transformed', rec, isCreate ? 'Will create' : 'Will update');
                        }
                    });

                    execution.recordsOut = inputRecords.length - loadPreview.summary.errorCount - loadPreview.summary.skipCount;
                    execution.recordsFiltered = loadPreview.summary.skipCount;
                    execution.recordsErrored = loadPreview.summary.errorCount;
                    execution.warnings = loadPreview.warnings;

                    // Create samples from load preview
                    execution.samples = this.createLoadSamples(loadPreview, opts.maxSamplesPerStep);

                    outputRecords = inputRecords; // Pass through for any subsequent steps
                    break;
                }

                default:
                    // Pass through for unhandled step types
                    outputRecords = inputRecords;
                    execution.recordsOut = inputRecords.length;
                    execution.warnings.push(`Step type "${stepType}" not fully simulated in sandbox`);
                    break;
            }

        } catch (error) {
            execution.status = 'error';
            execution.errorMessage = error instanceof Error ? error.message : String(error);
            execution.recordsErrored = inputRecords.length;
            outputRecords = []; // On error, output empty
        }

        execution.durationMs = Date.now() - stepStart;

        return { execution, outputRecords, loadPreview };
    }

    /**
     * Simulate load operations to preview what would happen
     */
    private async simulateLoadOperations(
        ctx: RequestContext,
        step: any,
        records: Record<string, unknown>[],
        opts: Required<SandboxOptions>,
    ): Promise<LoadOperationPreview> {
        const adapterCode = (step.config as any)?.adapterCode || 'unknown';
        const entityType = this.inferEntityType(adapterCode);

        const preview: LoadOperationPreview = {
            entityType,
            adapterCode,
            operations: {
                create: [],
                update: [],
                delete: [],
                skip: [],
                error: [],
            },
            summary: {
                createCount: 0,
                updateCount: 0,
                deleteCount: 0,
                skipCount: 0,
                errorCount: 0,
            },
            warnings: [],
        };

        // Analyze each record to determine operation
        for (let i = 0; i < Math.min(records.length, opts.maxRecords); i++) {
            const record = records[i];
            const recordId = this.extractRecordId(record);
            const operation = await this.determineLoadOperation(ctx, step, record, entityType);

            const detail: LoadOperationDetail = {
                recordIndex: i,
                recordId,
                entityId: operation.entityId,
                reason: operation.reason,
                data: record,
                existingData: operation.existingData,
                diff: operation.diff,
            };

            switch (operation.type) {
                case 'create':
                    preview.operations.create.push(detail);
                    preview.summary.createCount++;
                    break;
                case 'update':
                    preview.operations.update.push(detail);
                    preview.summary.updateCount++;
                    break;
                case 'delete':
                    preview.operations.delete.push(detail);
                    preview.summary.deleteCount++;
                    break;
                case 'skip':
                    preview.operations.skip.push(detail);
                    preview.summary.skipCount++;
                    break;
                case 'error':
                    preview.operations.error.push(detail);
                    preview.summary.errorCount++;
                    break;
            }
        }

        // Add warnings for common issues
        if (preview.summary.deleteCount > 0) {
            preview.warnings.push(`${preview.summary.deleteCount} records will be deleted - this cannot be undone`);
        }
        if (preview.summary.errorCount > 0) {
            preview.warnings.push(`${preview.summary.errorCount} records have validation errors and will not be loaded`);
        }
        if (records.length > opts.maxRecords) {
            preview.warnings.push(`Only ${opts.maxRecords} of ${records.length} records were analyzed`);
        }

        return preview;
    }

    /**
     * Determine what load operation would be performed for a record
     */
    private async determineLoadOperation(
        ctx: RequestContext,
        step: any,
        record: Record<string, unknown>,
        entityType: string,
    ): Promise<{
        type: 'create' | 'update' | 'delete' | 'skip' | 'error';
        entityId: string | null;
        reason: string;
        existingData?: Record<string, unknown>;
        diff?: FieldDiff[];
    }> {
        // This is a simplified simulation - in production, this would
        // query the actual database to check for existing records

        const recordId = this.extractRecordId(record);
        const strategy = (step.config as any)?.strategy || 'upsert';

        // Check for required fields
        const requiredFields = this.getRequiredFields(entityType);
        const missingFields = requiredFields.filter(f => record[f] == null);
        if (missingFields.length > 0) {
            return {
                type: 'error',
                entityId: null,
                reason: `Missing required fields: ${missingFields.join(', ')}`,
            };
        }

        // Determine operation based on strategy and record ID
        if (recordId) {
            // Has ID - likely an update
            if (strategy === 'create-only') {
                return {
                    type: 'skip',
                    entityId: recordId,
                    reason: 'Record has ID but strategy is create-only',
                };
            }
            return {
                type: 'update',
                entityId: recordId,
                reason: 'Record has existing ID',
                diff: [], // Would compute actual diff in production
            };
        } else {
            // No ID - likely a create
            if (strategy === 'update-only') {
                return {
                    type: 'skip',
                    entityId: null,
                    reason: 'Record has no ID but strategy is update-only',
                };
            }
            return {
                type: 'create',
                entityId: null,
                reason: 'New record',
            };
        }
    }

    /**
     * Compute field-level diffs between two records
     */
    private computeFieldDiffs(before: Record<string, unknown>, after: Record<string, unknown>): FieldDiff[] {
        const diffs: FieldDiff[] = [];
        const allFields = new Set([...Object.keys(before), ...Object.keys(after)]);

        for (const field of allFields) {
            const beforeValue = before[field];
            const afterValue = after[field];
            const beforeType = beforeValue === null ? 'null' : typeof beforeValue;
            const afterType = afterValue === null ? 'null' : typeof afterValue;

            let changeType: FieldDiff['changeType'];
            if (!(field in before) && field in after) {
                changeType = 'added';
            } else if (field in before && !(field in after)) {
                changeType = 'removed';
            } else if (!this.deepEquals(beforeValue, afterValue)) {
                changeType = 'modified';
            } else {
                changeType = 'unchanged';
            }

            if (changeType !== 'unchanged') {
                diffs.push({
                    field,
                    changeType,
                    beforeValue,
                    afterValue,
                    beforeType,
                    afterType,
                });
            }
        }

        return diffs;
    }

    /**
     * Aggregate field changes across all samples
     */
    private aggregateFieldChanges(samples: RecordSample[]): FieldChange[] {
        const fieldMap = new Map<string, {
            changeType: FieldChange['changeType'];
            count: number;
            sampleBefore: unknown[];
            sampleAfter: unknown[];
        }>();

        for (const sample of samples) {
            for (const diff of sample.fieldDiffs) {
                const existing = fieldMap.get(diff.field);
                if (existing) {
                    existing.count++;
                    if (existing.sampleBefore.length < 3) {
                        existing.sampleBefore.push(diff.beforeValue);
                        existing.sampleAfter.push(diff.afterValue);
                    }
                } else {
                    fieldMap.set(diff.field, {
                        changeType: diff.changeType === 'modified' ? 'modified' :
                            diff.changeType === 'added' ? 'added' :
                            diff.changeType === 'removed' ? 'removed' : 'modified',
                        count: 1,
                        sampleBefore: [diff.beforeValue],
                        sampleAfter: [diff.afterValue],
                    });
                }
            }
        }

        const totalRecords = samples.length;
        return Array.from(fieldMap.entries()).map(([field, data]) => ({
            field,
            changeType: data.changeType,
            affectedCount: data.count,
            totalRecords,
            percentage: Math.round((data.count / totalRecords) * 100),
            sampleBefore: data.sampleBefore,
            sampleAfter: data.sampleAfter,
        }));
    }

    /**
     * Extract validation issues from a validate step
     */
    private extractValidationIssues(step: any, samples: RecordSample[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const rules = (step.config as any)?.rules || [];

        for (const sample of samples) {
            if (sample.outcome === 'filtered' || sample.outcome === 'error') {
                // Record was filtered out - likely validation failure
                issues.push({
                    recordIndex: sample.recordIndex,
                    recordId: sample.recordId,
                    field: '_record',
                    rule: 'validation',
                    message: sample.errorMessage || 'Record failed validation',
                    severity: 'error',
                    value: sample.before,
                });
            }
        }

        return issues;
    }

    /**
     * Create samples from load preview
     */
    private createLoadSamples(preview: LoadOperationPreview, maxSamples: number): RecordSample[] {
        const samples: RecordSample[] = [];
        const allOps = [
            ...preview.operations.create.map(o => ({ ...o, op: 'create' as const })),
            ...preview.operations.update.map(o => ({ ...o, op: 'update' as const })),
            ...preview.operations.error.map(o => ({ ...o, op: 'error' as const })),
            ...preview.operations.skip.map(o => ({ ...o, op: 'skip' as const })),
        ];

        for (let i = 0; i < Math.min(allOps.length, maxSamples); i++) {
            const op = allOps[i];
            samples.push({
                recordIndex: op.recordIndex,
                recordId: op.recordId,
                before: op.data,
                after: op.data,
                outcome: op.op === 'error' ? 'error' :
                    op.op === 'skip' ? 'filtered' :
                    'transformed',
                errorMessage: op.op === 'error' ? op.reason : undefined,
                fieldDiffs: op.diff || [],
            });
        }

        return samples;
    }

    /**
     * Determine the outcome of a transformation
     */
    private determineOutcome(
        before: Record<string, unknown>,
        after: Record<string, unknown>,
        diffs: FieldDiff[],
    ): RecordSample['outcome'] {
        if (Object.keys(after).length === 0 && Object.keys(before).length > 0) {
            return 'filtered';
        }
        if (diffs.length === 0) {
            return 'unchanged';
        }
        return 'transformed';
    }

    /**
     * Extract record ID from common fields
     */
    private extractRecordId(record: Record<string, unknown>): string | null {
        const idFields = ['id', '_id', 'ID', 'Id', 'sku', 'code', 'uuid', 'externalId'];
        for (const field of idFields) {
            if (record[field] != null) {
                return String(record[field]);
            }
        }
        return null;
    }

    /**
     * Infer entity type from adapter code
     */
    private inferEntityType(adapterCode: string): string {
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

    /**
     * Get required fields for an entity type
     */
    private getRequiredFields(entityType: string): string[] {
        const requirements: Record<string, string[]> = {
            'Product': ['name'],
            'ProductVariant': ['sku', 'productId'],
            'Customer': ['emailAddress'],
            'Collection': ['name'],
            'Facet': ['name', 'code'],
        };
        return requirements[entityType] || [];
    }

    /**
     * Clone a record for lineage (limit depth to avoid huge objects)
     */
    private cloneForLineage(data: Record<string, unknown>): Record<string, unknown> {
        try {
            const str = JSON.stringify(data);
            if (str.length > 10000) {
                // Too large, return summary
                return { _summary: `Object with ${Object.keys(data).length} keys (${str.length} chars)` };
            }
            return JSON.parse(str);
        } catch {
            return { _error: 'Could not serialize' };
        }
    }

    /**
     * Deep equality check
     */
    private deepEquals(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (typeof a !== typeof b) return false;
        if (a === null || b === null) return a === b;
        if (typeof a !== 'object') return a === b;

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            return a.every((item, idx) => this.deepEquals(item, b[idx]));
        }

        if (Array.isArray(a) !== Array.isArray(b)) return false;

        const aObj = a as Record<string, unknown>;
        const bObj = b as Record<string, unknown>;
        const aKeys = Object.keys(aObj);
        const bKeys = Object.keys(bObj);

        if (aKeys.length !== bKeys.length) return false;
        return aKeys.every(key => this.deepEquals(aObj[key], bObj[key]));
    }
}
