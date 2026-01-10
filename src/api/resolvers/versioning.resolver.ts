import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    RequestContext,
    Transaction,
} from '@vendure/core';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import {
    DiffService,
    RevisionService,
    ImpactAnalysisService,
    RiskAssessmentService,
} from '../../services/versioning';
import {
    DataHubPipelinePermission,
    PublishDataHubPipelinePermission,
    RunDataHubPipelinePermission,
} from '../../permissions';
import { ImpactAnalysisOptions, TimelineEntry, RevisionDiff } from '../../types';

interface SaveDraftInput {
    pipelineId: ID;
    definition: any;
}

interface PublishVersionInput {
    pipelineId: ID;
    commitMessage: string;
    definition?: any;
}

interface RevertInput {
    revisionId: ID;
    commitMessage?: string;
}

@Resolver()
export class DataHubVersioningResolver {
    constructor(
        private revisionService: RevisionService,
        private diffService: DiffService,
        private impactAnalysisService: ImpactAnalysisService,
        private riskAssessmentService: RiskAssessmentService,
    ) {}

    // VERSIONING QUERIES

    /**
     * Get timeline of revisions for a pipeline
     */
    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubPipelineTimeline(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; limit?: number },
    ): Promise<TimelineEntry[]> {
        return this.revisionService.getTimeline(ctx, args.pipelineId, args.limit || 50);
    }

    /**
     * Get diff between two revisions
     */
    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubRevisionDiff(
        @Ctx() ctx: RequestContext,
        @Args() args: { fromRevisionId: ID; toRevisionId: ID },
    ): Promise<RevisionDiff> {
        return this.revisionService.getDiff(ctx, args.fromRevisionId, args.toRevisionId);
    }

    /**
     * Get a specific revision
     */
    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubRevision(
        @Ctx() ctx: RequestContext,
        @Args() args: { revisionId: ID },
    ): Promise<PipelineRevision | null> {
        return this.revisionService.getRevision(ctx, args.revisionId);
    }

    /**
     * Check if pipeline has unpublished changes
     */
    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubHasUnpublishedChanges(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID },
    ): Promise<boolean> {
        return this.revisionService.hasUnpublishedChanges(ctx, args.pipelineId);
    }

    // IMPACT ANALYSIS QUERIES

    /**
     * Get impact analysis for a pipeline
     */
    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubImpactAnalysis(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; options?: ImpactAnalysisOptions },
    ) {
        // Run impact analysis
        const impact = await this.impactAnalysisService.analyze(ctx, args.pipelineId, args.options);

        // Assess risk and update impact
        const withRisk = await this.riskAssessmentService.assessAndUpdate(ctx, args.pipelineId, impact);

        return withRisk;
    }

    /**
     * Get detailed record information for drill-down
     */
    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubRecordDetails(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; recordIds: string[] },
    ) {
        return this.impactAnalysisService.getRecordDetails(ctx, args.pipelineId, args.recordIds);
    }

    /**
     * Analyze impact of a specific step
     */
    @Query()
    @Allow(RunDataHubPipelinePermission.Permission)
    async dataHubStepAnalysis(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; stepKey: string; options?: ImpactAnalysisOptions },
    ) {
        return this.impactAnalysisService.analyzeStep(ctx, args.pipelineId, args.stepKey, args.options);
    }

    // VERSIONING MUTATIONS

    /**
     * Save a draft revision (auto-save)
     */
    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async dataHubSaveDraft(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: SaveDraftInput },
    ): Promise<PipelineRevision | null> {
        return this.revisionService.saveDraft(ctx, {
            pipelineId: args.input.pipelineId as number,
            definition: args.input.definition,
            authorUserId: ctx.activeUserId as string,
            authorName: this.getUserDisplayName(ctx),
        });
    }

    /**
     * Publish a new version with commit message
     */
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
            definition: args.input.definition,
            authorUserId: ctx.activeUserId as string,
            authorName: this.getUserDisplayName(ctx),
        });
    }

    /**
     * Revert to a specific revision (creates new published version)
     */
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

    /**
     * Restore a draft to the working copy (without publishing)
     */
    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async dataHubRestoreDraft(
        @Ctx() ctx: RequestContext,
        @Args() args: { revisionId: ID },
    ): Promise<Pipeline> {
        return this.revisionService.restoreDraft(ctx, args.revisionId);
    }

    /**
     * Prune old draft revisions
     */
    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async dataHubPruneDrafts(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID },
    ): Promise<number> {
        return this.revisionService.pruneDrafts(ctx, args.pipelineId);
    }

    // Private helpers

    private getUserDisplayName(ctx: RequestContext): string {
        // Try to get user display name from session
        const user = ctx.session?.user;
        if (user) {
            const identifier = (user as any).identifier;
            if (identifier) return identifier;
        }
        return ctx.activeUserId ? `User ${ctx.activeUserId}` : 'Unknown';
    }
}
