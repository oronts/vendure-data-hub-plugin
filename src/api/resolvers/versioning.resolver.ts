import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    RequestContext,
    Transaction,
    CachedSessionUser,
} from '@vendure/core';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import {
    RevisionService,
    ImpactAnalysisService,
    RiskAssessmentService,
} from '../../services/versioning';
import { PipelineFormatService, VisualPipelineDefinition } from '../../services';
import {
    DataHubPipelinePermission,
    PublishDataHubPipelinePermission,
    RunDataHubPipelinePermission,
} from '../../permissions';
import { ImpactAnalysisOptions, TimelineEntry, RevisionDiff, PipelineDefinition } from '../../types';
import { PipelineDefinitionInput } from '../types';

interface SaveDraftInput {
    pipelineId: ID;
    definition: PipelineDefinitionInput;
}

interface PublishVersionInput {
    pipelineId: ID;
    commitMessage: string;
    definition?: PipelineDefinitionInput;
}

interface RevertInput {
    revisionId: ID;
    commitMessage?: string;
}

const DEFAULT_TIMELINE_LIMIT = 50;

@Resolver()
export class DataHubVersioningResolver {
    constructor(
        private revisionService: RevisionService,
        private impactAnalysisService: ImpactAnalysisService,
        private riskAssessmentService: RiskAssessmentService,
        private formatService: PipelineFormatService,
    ) {}

    /** Convert definition to canonical format if needed */
    private toCanonical(def: PipelineDefinitionInput): PipelineDefinition;
    private toCanonical(def: PipelineDefinitionInput | undefined): PipelineDefinition | undefined;
    private toCanonical(def: PipelineDefinitionInput | undefined): PipelineDefinition | undefined {
        if (!def) return undefined;
        // Already canonical format
        if ('steps' in def && Array.isArray((def as PipelineDefinition).steps)) {
            return def as PipelineDefinition;
        }
        // Visual format - convert to canonical
        if ('nodes' in def && Array.isArray((def as VisualPipelineDefinition).nodes)) {
            return this.formatService.toCanonical(def as VisualPipelineDefinition);
        }
        return def as PipelineDefinition;
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubPipelineTimeline(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; limit?: number },
    ): Promise<TimelineEntry[]> {
        return this.revisionService.getTimeline(ctx, args.pipelineId, args.limit || DEFAULT_TIMELINE_LIMIT);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubRevisionDiff(
        @Ctx() ctx: RequestContext,
        @Args() args: { fromRevisionId: ID; toRevisionId: ID },
    ): Promise<RevisionDiff> {
        return this.revisionService.getDiff(ctx, args.fromRevisionId, args.toRevisionId);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubRevision(
        @Ctx() ctx: RequestContext,
        @Args() args: { revisionId: ID },
    ): Promise<PipelineRevision | null> {
        return this.revisionService.getRevision(ctx, args.revisionId);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubHasUnpublishedChanges(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID },
    ): Promise<boolean> {
        return this.revisionService.hasUnpublishedChanges(ctx, args.pipelineId);
    }

    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubImpactAnalysis(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; options?: ImpactAnalysisOptions },
    ) {
        const impact = await this.impactAnalysisService.analyze(ctx, args.pipelineId, args.options);
        return this.riskAssessmentService.assessAndUpdate(ctx, args.pipelineId, impact);
    }

    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubRecordDetails(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; recordIds: string[] },
    ) {
        return this.impactAnalysisService.getRecordDetails(ctx, args.pipelineId, args.recordIds);
    }

    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubStepAnalysis(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; stepKey: string; options?: ImpactAnalysisOptions },
    ) {
        return this.impactAnalysisService.analyzeStep(ctx, args.pipelineId, args.stepKey, args.options);
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async dataHubSaveDraft(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: SaveDraftInput },
    ): Promise<PipelineRevision | null> {
        return this.revisionService.saveDraft(ctx, {
            pipelineId: args.input.pipelineId as number,
            definition: this.toCanonical(args.input.definition),
            authorUserId: ctx.activeUserId as string,
            authorName: this.getUserDisplayName(ctx),
        });
    }

    @Mutation()
    @Transaction()
    @Allow(PublishDataHubPipelinePermission.Permission)
    async dataHubPublishVersion(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: PublishVersionInput },
    ): Promise<PipelineRevision> {
        return this.revisionService.publishVersion(ctx, {
            pipelineId: args.input.pipelineId as number,
            commitMessage: args.input.commitMessage,
            definition: this.toCanonical(args.input.definition),
            authorUserId: ctx.activeUserId as string,
            authorName: this.getUserDisplayName(ctx),
        });
    }

    @Mutation()
    @Transaction()
    @Allow(PublishDataHubPipelinePermission.Permission)
    async dataHubRevertToRevision(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: RevertInput },
    ): Promise<PipelineRevision> {
        return this.revisionService.revertToRevision(ctx, {
            revisionId: args.input.revisionId as number,
            commitMessage: args.input.commitMessage,
            authorUserId: ctx.activeUserId as string,
            authorName: this.getUserDisplayName(ctx),
        });
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async dataHubRestoreDraft(
        @Ctx() ctx: RequestContext,
        @Args() args: { revisionId: ID },
    ): Promise<Pipeline> {
        return this.revisionService.restoreDraft(ctx, args.revisionId);
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async dataHubPruneDrafts(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID },
    ): Promise<number> {
        return this.revisionService.pruneDrafts(ctx, args.pipelineId);
    }

    private getUserDisplayName(ctx: RequestContext): string {
        const user = ctx.session?.user as CachedSessionUser | undefined;
        if (user?.identifier) {
            return user.identifier;
        }
        return ctx.activeUserId ? `User ${ctx.activeUserId}` : 'Unknown';
    }
}
