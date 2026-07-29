import { Injectable } from '@nestjs/common';
import type { DeletionResponse } from '@vendure/common/lib/generated-types';
import { ID, ListQueryOptions, PaginatedList, RequestContext } from '@vendure/core';
import {
    Pipeline,
    PipelineRevision,
    PipelineRun,
} from '../../entities/pipeline';
import {
    DryRunMessage,
    PipelineDefinition,
    PipelineMetrics,
} from '../../types';
import type { SeededInputMode } from '../../runtime/orchestration';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import {
    DataHubLogger,
    DataHubLoggerFactory,
} from '../logger';
import { LOGGER_CONTEXTS } from '../../constants';
import { PipelineExecutionPermissionService } from './pipeline-execution-permission.service';
import {
    PipelineRunService,
    type IdempotentSeededRunOptions,
    type IdempotentSeededRunResult,
    type SeededRunOptions,
} from './pipeline-run.service';
import { buildDryRunMessages } from './dry-run-messages';
import { PipelineQueryService } from './pipeline-query.service';
import { PipelineMutationService } from './pipeline-mutation.service';
import { PipelineLifecycleService } from './pipeline-lifecycle.service';
import type {
    CreatePipelineInput,
    PipelineListOptions,
    PipelineWriteOptions,
    UpdatePipelineInput,
} from './pipeline-management-types';

export type {
    CreatePipelineInput,
    UpdatePipelineInput,
} from './pipeline-management-types';
export type {
    IdempotentSeededRunOptions,
    IdempotentSeededRunResult,
    SeededRunOptions,
} from './pipeline-run.service';

@Injectable()
export class PipelineService {
    private readonly logger: DataHubLogger;

    constructor(
        private queries: PipelineQueryService,
        private mutations: PipelineMutationService,
        private lifecycle: PipelineLifecycleService,
        private pipelineRuns: PipelineRunService,
        private definitionValidator: DefinitionValidationService,
        private adapterRuntime: AdapterRuntimeService,
        private executionPermissions: PipelineExecutionPermissionService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    findAll(
        ctx: RequestContext,
        options?: PipelineListOptions,
    ): Promise<PaginatedList<Pipeline>> {
        return this.queries.findAll(ctx, options);
    }

    findOne(ctx: RequestContext, id: ID): Promise<Pipeline | null> {
        return this.queries.findOne(ctx, id);
    }

    findByCodes(ctx: RequestContext, codes: string[]): Promise<Pipeline[]> {
        return this.queries.findByCodes(ctx, codes);
    }

    findDependents(ctx: RequestContext, code: string): Promise<Pipeline[]> {
        return this.queries.findDependents(ctx, code);
    }

    findByCode(ctx: RequestContext, code: string): Promise<Pipeline | null> {
        return this.queries.findByCode(ctx, code);
    }

    claimCodeFirstOwnership(
        ctx: RequestContext,
        pipeline: Pipeline,
    ): Promise<void> {
        return this.mutations.claimCodeFirstOwnership(ctx, pipeline);
    }

    refreshCodeFirstPublishedDefinition(
        ctx: RequestContext,
        pipelineId: ID,
        definition: PipelineDefinition,
    ): Promise<Pipeline> {
        return this.mutations.refreshCodeFirstPublishedDefinition(
            ctx,
            pipelineId,
            definition,
        );
    }

    releaseCodeFirstOwnership(
        ctx: RequestContext,
        activeCodes: ReadonlySet<string>,
    ): Promise<number> {
        return this.mutations.releaseCodeFirstOwnership(ctx, activeCodes);
    }

    create(
        ctx: RequestContext,
        input: CreatePipelineInput,
        options: PipelineWriteOptions = {},
    ): Promise<Pipeline> {
        return this.mutations.create(ctx, input, options);
    }

    update(
        ctx: RequestContext,
        input: UpdatePipelineInput,
        options: PipelineWriteOptions = {},
    ): Promise<Pipeline> {
        return this.mutations.update(ctx, input, options);
    }

    delete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
        return this.mutations.delete(ctx, id);
    }

    publish(ctx: RequestContext, id: ID): Promise<Pipeline> {
        return this.lifecycle.publish(ctx, id);
    }

    approve(ctx: RequestContext, id: ID): Promise<Pipeline> {
        return this.lifecycle.approve(ctx, id);
    }

    submitForReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        return this.lifecycle.submitForReview(ctx, id);
    }

    rejectReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        return this.lifecycle.rejectReview(ctx, id);
    }

    archive(ctx: RequestContext, id: ID): Promise<Pipeline> {
        return this.lifecycle.archive(ctx, id);
    }

    reactivate(ctx: RequestContext, id: ID): Promise<Pipeline> {
        return this.lifecycle.reactivate(ctx, id);
    }

    listRevisions(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<PipelineRevision[]> {
        return this.lifecycle.listRevisions(ctx, pipelineId);
    }

    revertToRevision(
        ctx: RequestContext,
        revisionId: ID,
    ): Promise<Pipeline> {
        return this.lifecycle.revertToRevision(ctx, revisionId);
    }

    listRuns(
        ctx: RequestContext,
        options?: ListQueryOptions<PipelineRun>,
        pipelineId?: ID,
    ): Promise<PaginatedList<PipelineRun>> {
        return this.pipelineRuns.listRuns(ctx, options, pipelineId);
    }

    runById(ctx: RequestContext, id: ID): Promise<PipelineRun | null> {
        return this.pipelineRuns.runById(ctx, id);
    }

    startRun(
        ctx: RequestContext,
        pipelineId: ID,
        options?: {
            skipPermissionCheck?: boolean;
            triggeredBy?: string;
            expectedRevisionId?: ID;
        },
    ): Promise<PipelineRun> {
        return this.pipelineRuns.startRun(ctx, pipelineId, options);
    }

    cancelRun(ctx: RequestContext, id: ID): Promise<PipelineRun> {
        return this.pipelineRuns.cancelRun(ctx, id);
    }

    startRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: SeededRunOptions,
    ): Promise<PipelineRun> {
        return this.pipelineRuns.startRunWithSeed(ctx, pipelineId, seed, options);
    }

    startIdempotentRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
    ): Promise<IdempotentSeededRunResult> {
        return this.pipelineRuns.startIdempotentRunWithSeed(
            ctx,
            pipelineId,
            seed,
            options,
        );
    }

    startPinnedIdempotentRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        revisionId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
    ): Promise<IdempotentSeededRunResult> {
        return this.pipelineRuns.startPinnedIdempotentRunWithSeed(
            ctx,
            pipelineId,
            revisionId,
            seed,
            options,
        );
    }

    startRunByCode(
        ctx: RequestContext,
        code: string,
        opts?: {
            seedRecords?: unknown[];
            triggerKey?: string;
            seedMode?: SeededInputMode;
            skipPermissionCheck?: boolean;
            triggeredBy?: string;
            expectedRevisionId?: ID;
        },
    ): Promise<PipelineRun> {
        return this.pipelineRuns.startRunByCode(ctx, code, opts);
    }

    approveGate(
        ctx: RequestContext,
        runId: ID,
        stepKey: string,
    ): Promise<PipelineRun> {
        return this.pipelineRuns.approveGate(ctx, runId, stepKey);
    }

    rejectGate(
        ctx: RequestContext,
        runId: ID,
        stepKey: string,
    ): Promise<PipelineRun> {
        return this.pipelineRuns.rejectGate(ctx, runId, stepKey);
    }

    async dryRun(ctx: RequestContext, pipelineId: ID): Promise<{
        metrics: PipelineMetrics;
        messages: DryRunMessage[];
        sampleRecords?: Array<{
            step: string;
            before: Record<string, unknown>;
            after: Record<string, unknown>;
        }>;
    }> {
        const pipeline = await this.queries.getInActiveChannel(ctx, pipelineId);
        this.definitionValidator.validate(pipeline.definition);
        await this.executionPermissions.assertAllowed(ctx, pipeline.definition);

        this.logger.debug('Starting dry run', {
            pipelineId,
            pipelineCode: pipeline.code,
            stepCount: pipeline.definition?.steps?.length ?? 0,
        });

        const result = await this.adapterRuntime.executeDryRun(ctx, pipeline.definition);
        const messages = buildDryRunMessages(
            pipeline.definition,
            result.metrics,
            result.errors,
        );

        this.logger.debug('Dry run completed', {
            pipelineCode: pipeline.code,
            totalRecords: result.metrics.totalRecords,
            sampleCount: result.sampleRecords?.length ?? 0,
        });

        return {
            metrics: result.metrics,
            messages,
            sampleRecords: result.sampleRecords,
        };
    }
}
