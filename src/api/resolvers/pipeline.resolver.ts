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
import { DeletionResult } from '@vendure/common/lib/generated-types';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { PipelineService, CreatePipelineInput, UpdatePipelineInput, DefinitionValidationService, PipelineFormatService, VisualPipelineDefinition } from '../../services';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { PipelineDefinition } from '../../types';
import { PipelineDefinitionError } from '../../validation/pipeline-definition-error';
import { getErrorMessage } from '../../utils/error.utils';
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
        private domainEvents: DomainEventsService,
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
                issues: [getErrorMessage(e)],
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
                issues: [getErrorMessage(e)],
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
    async createDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { input: CreatePipelineInput }) {
        const result = await this.pipelineService.create(ctx, args.input);
        this.domainEvents.publishPipelineCreated(String(result.id), result.code);
        return result;
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async updateDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { input: UpdatePipelineInput }) {
        const result = await this.pipelineService.update(ctx, args.input);
        this.domainEvents.publishPipelineUpdated(String(result.id), result.code);
        return result;
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Delete)
    async deleteDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        const pipeline = await this.pipelineService.findOne(ctx, args.id);
        const result = await this.pipelineService.delete(ctx, args.id);
        if (result.result === DeletionResult.DELETED && pipeline) {
            this.domainEvents.publishPipelineDeleted(String(args.id), pipeline.code);
        }
        return result;
    }

    @Mutation()
    @Transaction()
    @Allow(PublishDataHubPipelinePermission.Permission)
    async publishDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        const result = await this.pipelineService.publish(ctx, args.id);
        this.domainEvents.publishPipelinePublished(String(result.id), result.code);
        return result;
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
    async archiveDataHubPipeline(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        const result = await this.pipelineService.archive(ctx, args.id);
        this.domainEvents.publishPipelineArchived(String(result.id), result.code);
        return result;
    }

    @Mutation()
    @Transaction()
    @Allow(PublishDataHubPipelinePermission.Permission)
    revertDataHubPipelineToRevision(@Ctx() ctx: RequestContext, @Args() args: { revisionId: ID }) {
        return this.pipelineService.revertToRevision(ctx, args.revisionId);
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async validateDataHubPipelineDefinition(@Ctx() ctx: RequestContext, @Args() args: ValidationInput) {
        try {
            // Convert to canonical format if in visual format
            let definition = args.definition;
            if (this.isVisualFormat(definition)) {
                definition = this.formatService.toCanonical(definition);
            }
            const level = args.level?.toUpperCase() as ValidationLevel | undefined;
            const result = await this.definitionValidator.validateAsync(definition as PipelineDefinition, {
                level,
            }, ctx);
            return {
                isValid: result.isValid,
                issues: result.issues,
                warnings: result.warnings,
                level: result.level,
            };
        } catch (e) {
            if (e instanceof PipelineDefinitionError) {
                return {
                    isValid: false,
                    issues: e.issues,
                    warnings: [],
                    level: ValidationLevel.FULL,
                };
            }
            const msg = getErrorMessage(e);
            const messages = msg.split('\n').map(l => l.trim()).filter(Boolean);
            return {
                isValid: false,
                issues: messages.map(message => ({ message })),
                warnings: [],
                level: ValidationLevel.FULL,
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
