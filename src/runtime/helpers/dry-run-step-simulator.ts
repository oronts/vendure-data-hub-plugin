import type { RequestContext } from '@vendure/core';
import { SANDBOX } from '../../constants';
import type {
    DryRunRecordError,
    JsonObject,
    PipelineStepDefinition,
} from '../../types';
import { getAdapterCode } from '../../types/step-configs';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { deepClone } from '../../utils/object-path.utils';
import type { DataHubLogger } from '../../services/logger';
import type { ExtractExecutor, LoadExecutor, TransformExecutor } from '../executors';
import type {
    BranchOutput,
    ExecutorContext,
    OnRecordErrorCallback,
    RecordObject,
} from '../executor-types';
import { isBranchOutput } from '../executor-types';
import { resolveEffectiveStepContext } from '../orchestration/effective-context';

export interface DryRunSample {
    step: string;
    before: RecordObject;
    after: RecordObject;
}

export interface DryRunStepContext {
    errors: DryRunRecordError[];
    onRecordError: OnRecordErrorCallback;
}

export interface DryRunStepResult {
    output: RecordObject[] | BranchOutput;
    processedDelta: number;
    samples: DryRunSample[];
}

interface LinearStepResult {
    records: RecordObject[];
    processedDelta: number;
    samples: DryRunSample[];
}

type StepHandler = (
    ctx: RequestContext,
    step: PipelineStepDefinition,
    records: RecordObject[],
    executorContext: ExecutorContext,
    dryRunContext: DryRunStepContext,
    details: JsonObject[],
) => Promise<LinearStepResult>;

export class DryRunStepSimulator {
    private readonly sampleLimit = SANDBOX.MAX_SAMPLES_PER_STEP;
    private readonly handlers: Record<string, StepHandler>;

    constructor(
        private readonly extractExecutor: ExtractExecutor,
        private readonly transformExecutor: TransformExecutor,
        private readonly loadExecutor: LoadExecutor,
        private readonly logger: DataHubLogger,
    ) {
        this.handlers = {
            TRIGGER: this.simulateTrigger.bind(this),
            EXTRACT: this.simulateExtract.bind(this),
            TRANSFORM: this.simulateTransform.bind(this),
            VALIDATE: this.simulateValidate.bind(this),
            LOAD: this.simulateLoad.bind(this),
            ENRICH: this.simulateSideEffect.bind(this),
            EXPORT: this.simulateSideEffect.bind(this),
            FEED: this.simulateSideEffect.bind(this),
            SINK: this.simulateSideEffect.bind(this),
            GATE: this.simulateSideEffect.bind(this),
        };
    }

    async simulateStep(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: RecordObject[],
        executorContext: ExecutorContext,
        dryRunContext: DryRunStepContext,
        details: JsonObject[],
        graphMode: boolean,
    ): Promise<DryRunStepResult> {
        const detailStartIndex = details.length;
        try {
            const result = step.type === 'ROUTE'
                ? await this.simulateRoute(ctx, step, records, details, graphMode)
                : await this.simulateLinearStep(
                    ctx,
                    step,
                    records,
                    executorContext,
                    dryRunContext,
                    details,
                );
            this.recordStepCounts(
                details,
                detailStartIndex,
                step,
                records.length,
                this.countOutputRecords(result.output),
            );
            return result;
        } catch (error) {
            return this.recordStepFailure(
                error,
                step,
                records.length,
                dryRunContext,
                details,
            );
        }
    }

    private async simulateLinearStep(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: RecordObject[],
        executorContext: ExecutorContext,
        dryRunContext: DryRunStepContext,
        details: JsonObject[],
    ): Promise<DryRunStepResult> {
        const handler = this.handlers[step.type];
        if (!handler) {
            return this.simulateUnknownStep(step, records, details);
        }
        const result = await handler(
            ctx,
            step,
            records,
            executorContext,
            dryRunContext,
            details,
        );
        return { ...result, output: result.records };
    }

    private noop(records: RecordObject[]): LinearStepResult {
        return { records, processedDelta: 0, samples: [] };
    }

    private async simulateTrigger(
        _ctx: RequestContext,
        _step: PipelineStepDefinition,
        records: RecordObject[],
    ): Promise<LinearStepResult> {
        return this.noop(records);
    }

    private async simulateExtract(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        _records: RecordObject[],
        executorContext: ExecutorContext,
        dryRunContext: DryRunStepContext,
    ): Promise<LinearStepResult> {
        const extracted = await this.extractExecutor.execute(
            ctx,
            step,
            executorContext,
            dryRunContext.onRecordError,
        );
        const records = step.schemaRef
            ? await this.extractExecutor.validateExtractedRecords(
                ctx,
                step,
                extracted,
                dryRunContext.onRecordError,
            )
            : extracted;
        const samples = records.slice(0, this.sampleLimit).map(record => ({
            step: step.key || step.name || 'extract',
            before: {},
            after: record,
        }));
        if (records.length === 0) {
            this.logger.debug('Dry run extract returned 0 records', {
                stepKey: step.key,
                adapterCode: getAdapterCode(step),
            });
        }
        return { records, processedDelta: extracted.length, samples };
    }

    private async simulateTransform(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: RecordObject[],
        executorContext: ExecutorContext,
    ): Promise<LinearStepResult> {
        const before = records
            .slice(0, this.sampleLimit)
            .map(record => deepClone(record));
        const pipelineContext = resolveEffectiveStepContext(
            ctx,
            executorContext.definitionContext,
            step.context,
        );
        const transformed = await this.transformExecutor.executeOperator(
            ctx,
            step,
            records,
            executorContext,
            pipelineContext,
        );
        return {
            records: transformed,
            processedDelta: 0,
            samples: this.collectSamples(step, before, transformed, 'transform'),
        };
    }

    private async simulateValidate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: RecordObject[],
    ): Promise<LinearStepResult> {
        const before = records
            .slice(0, this.sampleLimit)
            .map(record => deepClone(record));
        const validated = await this.transformExecutor.executeValidate(ctx, step, records);
        return {
            records: validated,
            processedDelta: 0,
            samples: this.collectSamples(step, before, validated, 'validate'),
        };
    }

    private async simulateLoad(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: RecordObject[],
        executorContext: ExecutorContext,
        _dryRunContext: DryRunStepContext,
        details: JsonObject[],
    ): Promise<LinearStepResult> {
        const pipelineContext = resolveEffectiveStepContext(
            ctx,
            executorContext.definitionContext,
            step.context,
        );
        const simulation = await this.loadExecutor.simulate(
            ctx,
            step,
            records,
            pipelineContext,
        );
        const adapterCode = getAdapterCode(step);
        details.push({
            stepKey: step.key,
            ...(adapterCode ? { adapterCode } : {}),
            ...simulation,
        });
        return this.noop(records);
    }

    private async simulateSideEffect(
        _ctx: RequestContext,
        step: PipelineStepDefinition,
        records: RecordObject[],
        _executorContext: ExecutorContext,
        _dryRunContext: DryRunStepContext,
        details: JsonObject[],
    ): Promise<LinearStepResult> {
        details.push({
            stepKey: step.key,
            stepType: step.type,
            recordsIn: records.length,
            recordsOut: records.length,
            simulation: 'SKIPPED',
            warning: `${step.type} side effects are not executed during dry run`,
        });
        return this.noop(records);
    }

    private async simulateRoute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        records: RecordObject[],
        details: JsonObject[],
        graphMode: boolean,
    ): Promise<DryRunStepResult> {
        if (!graphMode) {
            const output = await this.transformExecutor.executeRoute(ctx, step, records);
            return { output, processedDelta: 0, samples: [] };
        }

        const output = await this.transformExecutor.executeRouteBranches(ctx, step, records);
        const branches = Object.fromEntries(
            Object.entries(output.branches).map(([branch, branchRecords]) => (
                [branch, branchRecords.length]
            )),
        );
        details.push({
            stepKey: step.key,
            ...(getAdapterCode(step) ? { adapterCode: getAdapterCode(step) } : {}),
            branches,
        });
        return { output, processedDelta: 0, samples: [] };
    }

    private simulateUnknownStep(
        step: PipelineStepDefinition,
        records: RecordObject[],
        details: JsonObject[],
    ): DryRunStepResult {
        const warning = `Step type "${step.type}" is not supported by dry run`;
        this.logger.debug(warning, {
            stepKey: step.key,
            stepType: step.type,
        });
        details.push({
            stepKey: step.key,
            stepType: step.type,
            simulation: 'SKIPPED',
            warning,
        });
        return { ...this.noop(records), output: records };
    }

    private recordStepFailure(
        error: unknown,
        step: PipelineStepDefinition,
        recordsIn: number,
        dryRunContext: DryRunStepContext,
        details: JsonObject[],
    ): DryRunStepResult {
        const message = getErrorMessage(error);
        const stepKey = step.key || step.name || 'unknown';
        dryRunContext.errors.push({ stepKey, message });
        details.push({
            stepKey,
            stepType: step.type,
            recordsIn,
            recordsOut: 0,
            simulation: 'FAILED',
            error: message,
        });
        this.logger.error(
            'Dry run step failed',
            toErrorOrUndefined(error),
            { stepKey, stepType: step.type },
        );
        return { output: [], processedDelta: 0, samples: [] };
    }

    private recordStepCounts(
        details: JsonObject[],
        detailStartIndex: number,
        step: PipelineStepDefinition,
        recordsIn: number,
        recordsOut: number,
    ): void {
        const detail = details
            .slice(detailStartIndex)
            .find(candidate => candidate['stepKey'] === step.key);
        if (detail) {
            detail['stepType'] = step.type;
            detail['recordsIn'] = recordsIn;
            detail['recordsOut'] = recordsOut;
            return;
        }
        details.push({
            stepKey: step.key,
            stepType: step.type,
            recordsIn,
            recordsOut,
        });
    }

    private countOutputRecords(output: RecordObject[] | BranchOutput): number {
        return isBranchOutput(output)
            ? Object.values(output.branches).reduce(
                (total, branchRecords) => total + branchRecords.length,
                0,
            )
            : output.length;
    }

    private collectSamples(
        step: PipelineStepDefinition,
        before: RecordObject[],
        after: RecordObject[],
        fallbackStepName: string,
    ): DryRunSample[] {
        return before
            .slice(0, after.length)
            .map((record, index) => ({
                step: step.key || step.name || fallbackStepName,
                before: record,
                after: after[index],
            }));
    }
}
