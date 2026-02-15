import { Args, Query, Resolver, Mutation } from '@nestjs/graphql';
import { Allow, RequestContext, Ctx, Transaction, TransactionalConnection } from '@vendure/core';
import { ViewDataHubRunsPermission, DataHubPipelinePermission } from '../../permissions';
import { PipelineRun, Pipeline } from '../../entities/pipeline';
import { MessageConsumerService } from '../../services/events/message-consumer.service';
import { RunStatus, SortOrder, LOGGER_CONTEXTS, QUEUE } from '../../constants/index';
import { DataHubLogger } from '../../services/logger';

const logger = new DataHubLogger(LOGGER_CONTEXTS.QUEUE_RESOLVER);

interface QueueStats {
    pending: number;
    running: number;
    failed: number;
    completedToday: number;
    byPipeline: Array<{ code: string; pending: number; running: number }>;
    recentFailed: Array<{ id: string; code: string; finishedAt: Date | null; error: string | null }>;
}

interface ConsumerStatus {
    pipelineCode: string;
    queueName: string;
    isActive: boolean;
    messagesProcessed: number;
    messagesFailed: number;
    lastMessageAt: Date | null;
}


@Resolver()
export class DataHubQueueAdminResolver {
    constructor(
        private connection: TransactionalConnection,
        private messageConsumer: MessageConsumerService,
    ) {}

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    async dataHubQueueStats(@Ctx() ctx: RequestContext): Promise<QueueStats> {
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const pending = await repo.count({ where: { status: RunStatus.PENDING } });
        const running = await repo.count({ where: { status: RunStatus.RUNNING } });
        const failed = await repo.count({ where: { status: RunStatus.FAILED } });

        const completedTodayQb = repo.createQueryBuilder('pr')
            .where('pr.status = :st', { st: RunStatus.COMPLETED })
            .andWhere('pr.finishedAt >= :mid', { mid: midnight.toISOString() });
        const completedToday = await completedTodayQb.getCount();

        // Use a single aggregated query with GROUP BY instead of N queries per pipeline
        const pipelineStats = await repo.createQueryBuilder('pr')
            .leftJoin('pr.pipeline', 'pipeline')
            .select('pipeline.code', 'code')
            .addSelect('pr.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('pr.status IN (:...statuses)', { statuses: [RunStatus.PENDING, RunStatus.RUNNING] })
            .groupBy('pipeline.code')
            .addGroupBy('pr.status')
            .getRawMany<{ code: string; status: string; count: string }>();

        // Transform aggregated stats into the expected format
        const statsMap = new Map<string, { pending: number; running: number }>();
        for (const row of pipelineStats) {
            let entry = statsMap.get(row.code);
            if (!entry) {
                entry = { pending: 0, running: 0 };
                statsMap.set(row.code, entry);
            }
            if (row.status === RunStatus.PENDING) {
                entry.pending = parseInt(row.count, 10);
            } else if (row.status === RunStatus.RUNNING) {
                entry.running = parseInt(row.count, 10);
            }
        }

        const byPipeline: Array<{ code: string; pending: number; running: number }> = Array.from(
            statsMap.entries(),
        ).map(([code, counts]) => ({ code, ...counts }));

        const recentFailedQb = repo.createQueryBuilder('pr')
            .leftJoin('pr.pipeline', 'pipeline')
            .addSelect(['pipeline.code'])
            .where('pr.status = :st', { st: RunStatus.FAILED })
            .orderBy('pr.finishedAt', SortOrder.DESC)
            .limit(QUEUE.DEFAULT_RECENT_FAILED_LIMIT);
        const recentFailedRows = await recentFailedQb.getMany();
        const recentFailed = recentFailedRows.map(r => ({
            id: String(r.id),
            code: (r.pipeline as Pipeline | undefined)?.code ?? '',
            finishedAt: r.finishedAt,
            error: r.error,
        }));

        return { pending, running, failed, completedToday, byPipeline, recentFailed };
    }

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    dataHubConsumers(): ConsumerStatus[] {
        const statuses = this.messageConsumer.getConsumerStatus();
        return statuses.map(s => ({
            pipelineCode: s.pipelineCode,
            queueName: s.queueName,
            isActive: s.running,
            messagesProcessed: s.messagesProcessed,
            messagesFailed: s.messagesFailed,
            lastMessageAt: s.lastMessageAt ?? null,
        }));
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async startDataHubConsumer(
        @Ctx() _ctx: RequestContext,
        @Args() args: { pipelineCode: string },
    ): Promise<boolean> {
        try {
            await this.messageConsumer.startConsumerByCode(args.pipelineCode);
            return true;
        } catch (error) {
            logger.debug(`Consumer start failed for pipeline ${args.pipelineCode}`, { error });
            return false;
        }
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubPipelinePermission.Update)
    async stopDataHubConsumer(
        @Ctx() _ctx: RequestContext,
        @Args() args: { pipelineCode: string },
    ): Promise<boolean> {
        try {
            await this.messageConsumer.stopConsumerByCode(args.pipelineCode);
            return true;
        } catch (error) {
            logger.debug(`Consumer stop failed for pipeline ${args.pipelineCode}`, { error });
            return false;
        }
    }
}
