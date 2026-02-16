import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';
import { PipelineRun } from '../../entities/pipeline';
import { PipelineService } from '../../services';
import { RunDataHubPipelinePermission } from '../../permissions';
import { getErrorMessage } from '../../utils/error.utils';

interface GateActionResult {
    success: boolean;
    run: PipelineRun | null;
    message: string | null;
}

@Resolver()
export class DataHubGateAdminResolver {
    constructor(private pipelineService: PipelineService) {}

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    async approveDataHubGate(
        @Ctx() ctx: RequestContext,
        @Args() args: { runId: ID; stepKey: string },
    ): Promise<GateActionResult> {
        try {
            const run = await this.pipelineService.approveGate(ctx, args.runId, args.stepKey);
            return { success: true, run, message: null };
        } catch (e) {
            return { success: false, run: null, message: getErrorMessage(e) };
        }
    }

    @Mutation()
    @Transaction()
    @Allow(RunDataHubPipelinePermission.Permission)
    async rejectDataHubGate(
        @Ctx() ctx: RequestContext,
        @Args() args: { runId: ID; stepKey: string },
    ): Promise<GateActionResult> {
        try {
            const run = await this.pipelineService.rejectGate(ctx, args.runId, args.stepKey);
            return { success: true, run, message: null };
        } catch (e) {
            return { success: false, run: null, message: getErrorMessage(e) };
        }
    }
}
