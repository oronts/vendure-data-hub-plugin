import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    Transaction,
} from '@vendure/core';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { PipelineService, CreatePipelineInput, UpdatePipelineInput, DefinitionValidationService, PipelineFormatService, VisualPipelineDefinition } from '../../services';
import { PipelineDefinition } from '../../types';
import { PipelineDefinitionError } from '../../validation/pipeline-definition-error';
import {
    DataHubPipelinePermission,
    RunDataHubPipelinePermission,
    ViewDataHubRunsPermission,
    PublishDataHubPipelinePermission,
    ReviewDataHubPipelinePermission,
} from '../../permissions';
import { ValidationLevel } from '../../services/validation/definition-validation.service';
import { PipelineDefinitionInput, ValidationInput } from '../types';

@Resolver()
export class DataHubPipelineAdminResolver {
    constructor(
        private pipelineService: PipelineService,
        private definitionValidator: DefinitionValidationService,
        private formatService: PipelineFormatService,
    ) {}

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubPipelines(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<Pipeline> },
    ): Promise<PaginatedList<Pipeline>> {
        return this.pipelineService.findAll(ctx, args.options);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<Pipeline | null> {
        return this.pipelineService.findOne(ctx, args.id);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubPipelineDependencies(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<Pipeline[]> {
        const pipeline = await this.pipelineService.findOne(ctx, args.id);
        if (!pipeline?.definition?.steps) return [];
        return this.pipelineService.findByCodes(ctx, pipeline.definition.dependsOn ?? []);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubPipelineDependents(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<Pipeline[]> {
        const pipeline = await this.pipelineService.findOne(ctx, args.id);
        if (!pipeline) return [];
        return this.pipelineService.findDependents(ctx, pipeline.code);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubPipelineRevisions(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID }) {
        return this.pipelineService.listRevisions(ctx, args.pipelineId);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubToVisualFormat(@Args() args: { definition: PipelineDefinitionInput }) {
        try {
            // Check if already in visual format (has nodes array)
            if (this.isVisualFormat(args.definition)) {
                return {
                    definition: args.definition as VisualPipelineDefinition,
                    success: true,
                    issues: [],
                };
            }
            // Convert from canonical to visual
            const visual = this.formatService.toVisual(args.definition as PipelineDefinition);
            return {
                definition: visual,
                success: true,
                issues: [],
            };
        } catch (e) {
            return {
                definition: { nodes: [], edges: [] },
                success: false,
                issues: [e instanceof Error ? e.message : 'Format conversion failed'],
            };
        }
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubToCanonicalFormat(@Args() args: { definition: PipelineDefinitionInput | VisualPipelineDefinition }) {
        try {
            // Check if already in canonical format (has steps array)
            if (this.isCanonicalFormat(args.definition)) {
                return {
                    definition: args.definition as PipelineDefinition,
                    success: true,
                    issues: [],
                };
            }
            // Convert from visual to canonical
            const canonical = this.formatService.toCanonical(args.definition as VisualPipelineDefinition);
            return {
                definition: canonical,
                success: true,
                issues: [],
            };
        } catch (e) {
            return {
                definition: { version: 1, steps: [] },
                success: false,
                issues: [e instanceof Error ? e.message : 'Format conversion failed'],
            };
        }
    }

    /** Check if definition is in visual format (has nodes array) */
    private isVisualFormat(def: unknown): def is VisualPipelineDefinition {
        return def != null && typeof def === 'object' && 'nodes' in def && Array.isArray((def as VisualPipelineDefinition).nodes);
    }

    /** Check if definition is in canonical format (has steps array) */
    private isCanonicalFormat(def: unknown): def is PipelineDefinition {
        return def != null && typeof def === 'object' && 'steps' in def && Array.isArray((def as PipelineDefinition).steps);
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Create)
    createDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { input: CreatePipelineInput }) {
        return this.pipelineService.create(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    updateDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { input: UpdatePipelineInput }) {
        return this.pipelineService.update(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Delete)
    deleteDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.pipelineService.delete(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(PublishDataHubPipelinePermission.Permission)
    publishDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.pipelineService.publish(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    submitDataHubPipelineForReview(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.pipelineService.submitForReview(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(ReviewDataHubPipelinePermission.Permission)
    approveDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.pipelineService.publish(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(ReviewDataHubPipelinePermission.Permission)
    rejectDataHubPipelineReview(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.pipelineService.rejectReview(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(PublishDataHubPipelinePermission.Permission)
    archiveDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.pipelineService.archive(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(PublishDataHubPipelinePermission.Permission)
    revertDataHubPipelineToRevision(@Ctx() ctx: RequestContext, @Args() args: { revisionId: ID }) {
        return this.pipelineService.revertToRevision(ctx, args.revisionId);
    }

    @Mutation()
    @Allow(DataHubPipelinePermission.Read)
    async validateDataHubPipelineDefinition(@Args() args: ValidationInput) {
        try {
            // Convert to canonical format if in visual format
            let definition = args.definition;
            if (this.isVisualFormat(definition)) {
                definition = this.formatService.toCanonical(definition);
            }
            const result = await this.definitionValidator.validateAsync(definition as PipelineDefinition, {
                level: args.level as ValidationLevel | undefined,
            });
            return {
                isValid: result.isValid,
                errors: result.issues.map(issue => issue.message),
                issues: result.issues,
                warnings: result.warnings,
                level: result.level,
            };
        } catch (e) {
            if (e instanceof PipelineDefinitionError) {
                return {
                    isValid: false,
                    errors: e.issues.map(issue => issue.message),
                    issues: e.issues,
                    warnings: [],
                    level: 'full',
                };
            }
            const msg = e instanceof Error ? e.message : String(e);
            const errors = msg.split('\n').map(l => l.trim()).filter(Boolean);
            return {
                isValid: false,
                errors,
                issues: errors.map(message => ({ message })),
                warnings: [],
                level: 'full',
            };
        }
    }

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    dataHubPipelineRuns(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: ID; options?: ListQueryOptions<PipelineRun> },
    ): Promise<PaginatedList<PipelineRun>> {
        return this.pipelineService.listRuns(ctx, args.options ?? {}, args.pipelineId);
    }

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    dataHubPipelineRun(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<PipelineRun | null> {
        return this.pipelineService.runById(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    startDataHubPipelineRun(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID }) {
        return this.pipelineService.startRun(ctx, args.pipelineId);
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    cancelDataHubPipelineRun(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.pipelineService.cancelRun(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    startDataHubPipelineDryRun(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID }) {
        return this.pipelineService.dryRun(ctx, args.pipelineId);
    }
}
