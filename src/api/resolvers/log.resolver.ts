import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ListQueryOptions, RequestContext } from '@vendure/core';
import { PipelineLogService } from '../../services';
import { PipelineLog } from '../../entities/pipeline';
import { ViewDataHubRunsPermission } from '../../permissions';
import { PAGINATION } from '../../constants/index';

@Resolver()
export class DataHubLogAdminResolver {
    constructor(private logService: PipelineLogService) {}

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    async dataHubLogs(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<PipelineLog> },
    ) {
        return this.logService.list(ctx, args.options);
    }

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    async dataHubRunLogs(@Ctx() ctx: RequestContext, @Args() args: { runId: string }) {
        return this.logService.getRunLogs(ctx, args.runId);
    }

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    async dataHubLogStats(@Ctx() ctx: RequestContext, @Args() args: { pipelineId?: string }) {
        return this.logService.getStats(ctx, args.pipelineId);
    }

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    async dataHubRecentLogs(@Ctx() ctx: RequestContext, @Args() args: { limit?: number }) {
        const safeTake = Math.min(args.limit ?? PAGINATION.RECENT_LOGS_LIMIT, PAGINATION.MAX_QUERY_LIMIT);
        return this.logService.getRecent(ctx, safeTake);
    }
}
