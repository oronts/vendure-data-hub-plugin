import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';
import { DataHubPipelinePermission } from '../../permissions';
import { CheckpointService } from '../../services';
import { CheckpointData } from '../types';

@Resolver()
export class DataHubCheckpointAdminResolver {
    constructor(private checkpoints: CheckpointService) {}

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubCheckpoint(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID }) {
        return this.checkpoints.getByPipeline(ctx, args.pipelineId);
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    updateDataHubCheckpoint(@Ctx() ctx: RequestContext, @Args() args: { pipelineId: ID; data: CheckpointData }) {
        return this.checkpoints.setForPipeline(ctx, args.pipelineId, args.data ?? {});
    }
}
