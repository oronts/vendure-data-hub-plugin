/**
 * Step Dispatcher
 *
 * Creates and dispatches step execution to appropriate strategies.
 * Converts between StepStrategyResult and StepExecutionResult for graph execution.
 */

import { Logger } from '@nestjs/common';
import { RequestContext, ID } from '@vendure/core';
import { PipelineDefinition, PipelineStepDefinition, StepType } from '../../../types/index';
import { StepType as StepTypeEnum } from '../../../constants/enums';
import {
    RecordObject,
    BranchOutput,
    OnRecordErrorCallback,
    ExecutorContext,
} from '../../executor-types';
import {
    ExtractExecutor,
    TransformExecutor,
    LoadExecutor,
    ExportExecutor,
    FeedExecutor,
    SinkExecutor,
} from '../../executors';
import { HookService } from '../../../services/events/hook.service';
import { DomainEventsService } from '../../../services/events/domain-events.service';
import { StepLogCallback, StepExecutionResult } from '../types';
import {
    StepStrategy,
    StepExecutionContext,
    StepStrategyResult,
    GraphStepStrategyResult,
} from './step-strategy.interface';
import { ExtractStepStrategy } from './extract-step.strategy';
import {
    TransformStepStrategy,
    ValidateStepStrategy,
    EnrichStepStrategy,
    RouteStepStrategy,
} from './transform-step.strategy';
import { LoadStepStrategy, LoadWithThroughputFn, ApplyIdempotencyFn } from './load-step.strategy';
import { ExportStepStrategy } from './export-step.strategy';
import { FeedStepStrategy } from './feed-step.strategy';
import { SinkStepStrategy } from './sink-step.strategy';

const logger = new Logger('DataHub:StepDispatcher');

/**
 * Dependencies required by the step dispatcher
 */
export interface StepDispatcherDeps {
    extractExecutor: ExtractExecutor;
    transformExecutor: TransformExecutor;
    loadExecutor: LoadExecutor;
    exportExecutor: ExportExecutor;
    feedExecutor: FeedExecutor;
    sinkExecutor: SinkExecutor;
    loadWithThroughput: LoadWithThroughputFn;
    applyIdempotency: ApplyIdempotencyFn;
}

/**
 * Step execution parameters
 */
export interface StepExecutionParams {
    ctx: RequestContext;
    definition: PipelineDefinition;
    step: PipelineStepDefinition;
    key: string;
    input: RecordObject[];
    executorCtx: ExecutorContext;
    hookService: HookService;
    domainEvents: DomainEventsService;
    onRecordError?: OnRecordErrorCallback;
    pipelineId?: ID;
    runId?: ID;
    stepLog?: StepLogCallback;
}

/**
 * Step Dispatcher for graph execution
 *
 * Creates appropriate strategies and dispatches step execution,
 * converting results to graph-compatible format.
 */
export class StepDispatcher {
    private extractStrategy: ExtractStepStrategy;
    private transformStrategy: TransformStepStrategy;
    private validateStrategy: ValidateStepStrategy;
    private enrichStrategy: EnrichStepStrategy;
    private routeStrategy: RouteStepStrategy;
    private loadStrategy: LoadStepStrategy;
    private exportStrategy: ExportStepStrategy;
    private feedStrategy: FeedStepStrategy;
    private sinkStrategy: SinkStepStrategy;

    constructor(deps: StepDispatcherDeps) {
        this.extractStrategy = new ExtractStepStrategy(deps.extractExecutor);
        this.transformStrategy = new TransformStepStrategy(deps.transformExecutor);
        this.validateStrategy = new ValidateStepStrategy(deps.transformExecutor);
        this.enrichStrategy = new EnrichStepStrategy(deps.transformExecutor);
        this.routeStrategy = new RouteStepStrategy(deps.transformExecutor);
        this.loadStrategy = new LoadStepStrategy(deps.loadWithThroughput, deps.applyIdempotency);
        this.exportStrategy = new ExportStepStrategy(deps.exportExecutor);
        this.feedStrategy = new FeedStepStrategy(deps.feedExecutor);
        this.sinkStrategy = new SinkStepStrategy(deps.sinkExecutor);
    }

    /**
     * Execute a step and return graph-compatible result
     */
    async executeStep(params: StepExecutionParams): Promise<StepExecutionResult> {
        const { step, key, input } = params;
        const context = this.buildContext(params);

        switch (step.type) {
            case StepType.TRIGGER:
                return this.executeTrigger(key);

            case StepType.EXTRACT:
                return this.executeWithStrategy(this.extractStrategy, context);

            case StepType.TRANSFORM:
                return this.executeWithStrategy(this.transformStrategy, context);

            case StepType.VALIDATE:
                return this.executeWithStrategy(this.validateStrategy, context);

            case StepType.ENRICH:
                return this.executeWithStrategy(this.enrichStrategy, context);

            case StepType.ROUTE:
                return this.executeRoute(context);

            case StepType.LOAD:
                return this.executeWithStrategy(this.loadStrategy, context, true);

            case StepType.EXPORT:
                return this.executeWithStrategy(this.exportStrategy, context, true);

            case StepType.FEED:
                return this.executeWithStrategy(this.feedStrategy, context, true);

            case StepType.SINK:
                return this.executeWithStrategy(this.sinkStrategy, context, true);

            default:
                return this.executeUnhandled(step, key, input);
        }
    }

    /**
     * Build execution context from params
     */
    private buildContext(params: StepExecutionParams): StepExecutionContext {
        return {
            ctx: params.ctx,
            definition: params.definition,
            step: params.step,
            records: params.input,
            executorCtx: params.executorCtx,
            hookService: params.hookService,
            domainEvents: params.domainEvents,
            pipelineId: params.pipelineId,
            runId: params.runId,
            stepLog: params.stepLog,
            onRecordError: params.onRecordError,
        };
    }

    /**
     * Execute TRIGGER step (no-op, returns empty)
     */
    private executeTrigger(key: string): StepExecutionResult {
        return {
            output: [],
            detail: { stepKey: key, type: StepTypeEnum.TRIGGER },
            processed: 0,
            succeeded: 0,
            failed: 0,
            counters: {},
        };
    }

    /**
     * Execute step using strategy and convert result
     */
    private async executeWithStrategy(
        strategy: StepStrategy,
        context: StepExecutionContext,
        emptyOutput: boolean = false,
    ): Promise<StepExecutionResult> {
        const result = await strategy.execute(context);
        return this.convertResult(result, emptyOutput);
    }

    /**
     * Execute ROUTE step with branched output
     */
    private async executeRoute(context: StepExecutionContext): Promise<StepExecutionResult> {
        const { result, branchOutput } = await this.routeStrategy.executeWithBranches(context);
        return {
            output: branchOutput,
            detail: result.detail,
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            counters: result.counters,
            event: result.event,
        };
    }

    /**
     * Handle unhandled step types
     */
    private executeUnhandled(step: PipelineStepDefinition, key: string, input: RecordObject[]): StepExecutionResult {
        logger.warn(
            `executeStep: Unhandled step type "${step.type}" for step "${key}" - passing through ${input.length} records`,
        );
        return {
            output: input,
            detail: { stepKey: key, type: step.type, unhandled: true },
            processed: 0,
            succeeded: 0,
            failed: 0,
            counters: {},
        };
    }

    /**
     * Convert StepStrategyResult to StepExecutionResult
     */
    private convertResult(result: StepStrategyResult, emptyOutput: boolean = false): StepExecutionResult {
        return {
            output: emptyOutput ? [] : result.records,
            detail: result.detail,
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            counters: result.counters,
            event: result.event,
        };
    }
}

/**
 * Create a step dispatcher with the given dependencies
 */
export function createStepDispatcher(deps: StepDispatcherDeps): StepDispatcher {
    return new StepDispatcher(deps);
}
