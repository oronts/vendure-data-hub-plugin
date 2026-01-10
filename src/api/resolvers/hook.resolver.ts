import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { HookService } from '../../services';
import { Pipeline } from '../../entities/pipeline';
import { DataHubPipelinePermission } from '../../permissions';

@Resolver()
export class DataHubHookAdminResolver {
    constructor(
        private hooks: HookService,
        private connection: TransactionalConnection,
    ) {}

    // HOOK QUERIES

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubPipelineHooks(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID }) {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, args.pipelineId);
        return (pipeline.definition as any)?.hooks ?? {};
    }

    // HOOK MUTATIONS

    @Mutation()
    @Allow(DataHubPipelinePermission.Update)
    async runDataHubHookTest(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId: ID; stage: string; payload?: any },
    ): Promise<boolean> {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, args.pipelineId);
        await this.hooks.run(
            ctx,
            pipeline.definition as any,
            args.stage as any,
            Array.isArray(args.payload) ? args.payload : undefined,
            !Array.isArray(args.payload) ? args.payload : undefined,
        );
        return true;
    }
}
