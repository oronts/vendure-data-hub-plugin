import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext, TransactionalConnection } from '@vendure/core';
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
    constructor(
        private pipelineService: PipelineService,
        private connection: TransactionalConnection,
    ) {}

    @Mutation()
    @Allow(RunDataHubPipelinePermission.Permission)
    async approveDataHubGate(
        @Ctx() ctx: RequestContext,
        @Args() args: { runId: ID; stepKey: string },
    ): Promise<GateActionResult> {
        try {
            const run = await this.connection.withTransaction(
                ctx,
                transactionalCtx => this.pipelineService.approveGate(
                    transactionalCtx,
                    args.runId,
                    args.stepKey,
                ),
            );
            return { success: true, run, message: null };
        } catch (e) {
            return { success: false, run: null, message: getErrorMessage(e) };
        }
    }

    @Mutation()
    @Allow(RunDataHubPipelinePermission.Permission)
    async rejectDataHubGate(
        @Ctx() ctx: RequestContext,
        @Args() args: { runId: ID; stepKey: string },
    ): Promise<GateActionResult> {
        try {
            const run = await this.connection.withTransaction(
                ctx,
                transactionalCtx => this.pipelineService.rejectGate(
                    transactionalCtx,
                    args.runId,
                    args.stepKey,
                ),
            );
            return { success: true, run, message: null };
        } catch (e) {
            return { success: false, run: null, message: getErrorMessage(e) };
        }
    }
}
