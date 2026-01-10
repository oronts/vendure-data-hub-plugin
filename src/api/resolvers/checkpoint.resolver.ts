import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext } from '@vendure/core';
import { DataHubPipelinePermission } from '../../permissions';
import { CheckpointService } from '../../services';

@Resolver()
export class DataHubCheckpointAdminResolver {
    constructor(private checkpoints: CheckpointService) {}

    // CHECKPOINT QUERIES

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubCheckpoint(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID }) {
        return this.checkpoints.getByPipeline(ctx, args.pipelineId);
    }

    // CHECKPOINT MUTATIONS

    @Mutation()
    @Allow(DataHubPipelinePermission.Update)
    setDataHubCheckpoint(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID; data: any }) {
        return this.checkpoints.setForPipeline(ctx, args.pipelineId, args.data ?? {});
    }
}
