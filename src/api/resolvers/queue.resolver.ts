import { Query, Resolver } from '@nestjs/graphql';
import { Allow, RequestContext, Ctx, TransactionalConnection } from '@vendure/core';
import { ViewDataHubRunsPermission } from '../../permissions';
import { PipelineRun, Pipeline } from '../../entities/pipeline';

@Resolver()
export class DataHubQueueAdminResolver {
    constructor(private connection: TransactionalConnection) {}

    // QUEUE QUERIES

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    async dataHubQueueStats(@Ctx() ctx: RequestContext) {
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const pending = await repo.count({ where: { status: 'PENDING' as any } as any });
        const running = await repo.count({ where: { status: 'RUNNING' as any } as any });
        const failed = await repo.count({ where: { status: 'FAILED' as any } as any });

        const completedTodayQb = repo.createQueryBuilder('pr')
            .where('pr.status = :st', { st: 'COMPLETED' })
            .andWhere('pr.finishedAt >= :mid', { mid: midnight.toISOString() });
        const completedToday = await completedTodayQb.getCount();

        // By pipeline
        const pipeRepo = this.connection.getRepository(ctx, Pipeline);
        const allPipes = await pipeRepo.find();
        const byPipeline: Array<{ code: string; pending: number; running: number }> = [];
        for (const p of allPipes) {
            const pc = await repo.count({ where: { pipeline: { id: p.id } as any, status: 'PENDING' as any } as any });
            const rc = await repo.count({ where: { pipeline: { id: p.id } as any, status: 'RUNNING' as any } as any });
            byPipeline.push({ code: p.code, pending: pc, running: rc });
        }

        // Recent failed runs
        const recentFailedQb = repo.createQueryBuilder('pr')
            .leftJoin('pr.pipeline', 'pipeline')
            .where('pr.status = :st', { st: 'FAILED' })
            .orderBy('pr.finishedAt', 'DESC')
            .limit(10);
        const recentFailedRows = await recentFailedQb.getMany();
        const recentFailed = recentFailedRows.map(r => ({
            id: r.id,
            code: (r as any).pipeline?.code ?? '',
            finishedAt: r.finishedAt,
            error: r.error,
        }));

        return { pending, running, failed, completedToday, byPipeline, recentFailed } as any;
    }
}
