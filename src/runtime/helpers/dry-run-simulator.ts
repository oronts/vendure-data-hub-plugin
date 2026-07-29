import type { RequestContext } from '@vendure/core';
import type {
    DryRunRecordError,
    JsonObject,
    PipelineDefinition,
    PipelineMetrics,
} from '../../types';
import type { DataHubLogger } from '../../services/logger';
import type { ExtractExecutor, LoadExecutor, TransformExecutor } from '../executors';
import type { ExecutorContext, OnRecordErrorCallback, RecordObject } from '../executor-types';
import { isBranchOutput } from '../executor-types';
import { deepClone } from '../../utils/object-path.utils';
import { executeDryRunGraph } from './dry-run-graph';
import { normalizeDryRunRecordLimit } from './dry-run-options';
import { buildDryRunReport } from './dry-run-report';
import { DryRunStepSimulator, type DryRunSample } from './dry-run-step-simulator';

interface DryRunContext {
    executorCtx: ExecutorContext;
    errors: DryRunRecordError[];
    onRecordError: OnRecordErrorCallback;
}

interface SimulationResult {
    processed: number;
    details: JsonObject[];
    sampleRecords: DryRunSample[];
    outputRecords: RecordObject[];
}

export class DryRunSimulator {
    private readonly stepSimulator: DryRunStepSimulator;

    constructor(
        extractExecutor: ExtractExecutor,
        transformExecutor: TransformExecutor,
        loadExecutor: LoadExecutor,
        logger: DataHubLogger,
    ) {
        this.stepSimulator = new DryRunStepSimulator(
            extractExecutor,
            transformExecutor,
            loadExecutor,
            logger,
        );
    }

    async executeDryRun(
        ctx: RequestContext,
        definition: PipelineDefinition,
        recordLimit?: number,
        initialRecords: readonly Record<string, unknown>[] = [],
    ): Promise<{
        metrics: PipelineMetrics;
        sampleRecords: DryRunSample[];
        outputRecords: RecordObject[];
        errors?: DryRunRecordError[];
    }> {
        const limit = normalizeDryRunRecordLimit(recordLimit);
        const seedRecords = initialRecords
            .slice(0, limit)
            .map(record => deepClone(record as RecordObject));
        const dryRunContext = this.prepareDryRunContext(definition, limit);
        const result = await this.simulateSteps(
            ctx,
            definition,
            seedRecords,
            dryRunContext,
        );

        return {
            ...buildDryRunReport(
            result.processed,
            result.details,
            result.sampleRecords,
            dryRunContext.errors,
            ),
            outputRecords: result.outputRecords,
        };
    }

    private prepareDryRunContext(
        definition: PipelineDefinition,
        recordLimit: number,
    ): DryRunContext {
        const errors: DryRunRecordError[] = [];
        return {
            executorCtx: {
                cpData: {},
                cpDirty: false,
                markCheckpointDirty: () => {},
                errorHandling: definition.context?.errorHandling,
                definitionContext: definition.context,
                recordLimit,
            },
            errors,
            onRecordError: async (stepKey: string, message: string) => {
                errors.push({ stepKey, message });
            },
        };
    }

    private async simulateSteps(
        ctx: RequestContext,
        definition: PipelineDefinition,
        initialRecords: RecordObject[],
        dryRunContext: DryRunContext,
    ): Promise<SimulationResult> {
        const details: JsonObject[] = [];
        if ((definition.edges?.length ?? 0) > 0) {
            const result = await executeDryRunGraph(
                definition,
                (step, input) => this.stepSimulator.simulateStep(
                    ctx,
                    step,
                    input,
                    dryRunContext.executorCtx,
                    dryRunContext,
                    details,
                    true,
                ),
                initialRecords,
            );
            return {
                processed: result.processed,
                details,
                sampleRecords: result.samples,
                outputRecords: result.outputRecords,
            };
        }

        let records = initialRecords;
        const sampleRecords: DryRunSample[] = [];
        let processed = initialRecords.length;
        for (const step of definition.steps) {
            const result = await this.stepSimulator.simulateStep(
                ctx,
                step,
                records,
                dryRunContext.executorCtx,
                dryRunContext,
                details,
                false,
            );
            records = isBranchOutput(result.output)
                ? Object.values(result.output.branches).flat()
                : result.output;
            processed += result.processedDelta;
            sampleRecords.push(...result.samples);
        }

        return { processed, details, sampleRecords, outputRecords: records };
    }
}
