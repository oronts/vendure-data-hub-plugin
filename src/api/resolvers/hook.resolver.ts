import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext, Transaction, TransactionalConnection } from '@vendure/core';
import type { JsonObject, PipelineDefinition, HookStageValue, PipelineHooks } from '../../types/index';
import { HookService } from '../../services';
import { Pipeline } from '../../entities/pipeline';
import { DataHubPipelinePermission } from '../../permissions';

@Resolver()
export class DataHubHookAdminResolver {
    constructor(
        private hooks: HookService,
        private connection: TransactionalConnection,
    ) {}

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubPipelineHooks(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID }): Promise<PipelineHooks> {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, args.pipelineId);
        const definition = pipeline.definition as PipelineDefinition | undefined;
        return definition?.hooks ?? {};
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async runDataHubHookTest(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; stage: string; payload?: JsonObject | JsonObject[] },
    ): Promise<boolean> {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, args.pipelineId);
        const definition = pipeline.definition as PipelineDefinition;
        const stage = args.stage as HookStageValue;
        await this.hooks.run(
            ctx,
            definition,
            stage,
            Array.isArray(args.payload) ? args.payload : undefined,
            !Array.isArray(args.payload) ? args.payload : undefined,
        );
        return true;
    }
}
