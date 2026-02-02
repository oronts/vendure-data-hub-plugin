import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { JsonObject } from '../../types/index';
import { RunDataHubPipelinePermission } from '../../permissions';
import { StepTestService } from '../../services/testing';

@Resolver()
export class DataHubTestAdminResolver {
    constructor(
        private readonly stepTestService: StepTestService,
    ) {}

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    async previewDataHubExtract(
        @Ctx() ctx: RequestContext,
        @Args() args: { step: JsonObject; limit?: number },
    ) {
        return this.stepTestService.previewExtract(ctx, args.step, {
            limit: args.limit,
        });
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    async simulateDataHubTransform(
        @Ctx() ctx: RequestContext,
        @Args() args: { step: JsonObject; records: JsonObject[] },
    ) {
        return this.stepTestService.simulateTransform(ctx, args.step, args.records);
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    async simulateDataHubValidate(
        @Ctx() ctx: RequestContext,
        @Args() args: { step: JsonObject; records: JsonObject[] },
    ) {
        return this.stepTestService.simulateValidate(ctx, args.step, args.records);
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    async simulateDataHubLoad(
        @Ctx() ctx: RequestContext,
        @Args() args: { step: JsonObject; records: JsonObject[] },
    ) {
        return this.stepTestService.validateLoadConfig(ctx, args.step, args.records);
    }
}
