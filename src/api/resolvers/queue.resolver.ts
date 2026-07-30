import { Args, Query, Resolver, Mutation } from '@nestjs/graphql';
import { Allow, RequestContext, Ctx, TransactionalConnection } from '@vendure/core';
import {
    RunDataHubPipelinePermission,
    ViewDataHubRunsPermission,
} from '../../permissions';
import { PipelineRun, Pipeline } from '../../entities/pipeline';
import { MessageConsumerService } from '../../services/events/message-consumer.service';
import { PipelineExecutionPermissionService } from '../../services/pipeline/pipeline-execution-permission.service';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { RunStatus, SortOrder, LOGGER_CONTEXTS, QUEUE } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';

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
    triggerKey: string;
    autoStart: boolean;
    desiredEnabled: boolean;
    queueName: string;
    isActive: boolean;
    messagesProcessed: number;
    messagesFailed: number;
    lastMessageAt: Date | null;
}


@Resolver()
export class DataHubQueueAdminResolver {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private messageConsumer: MessageConsumerService,
        private pipelineService: PipelineService,
        private executionPermissions: PipelineExecutionPermissionService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.QUEUE_RESOLVER);
    }

    @Query()
    @Allow(ViewDataHubRunsPermission.Permission)
    async dataHubQueueStats(@Ctx() ctx: RequestContext): Promise<QueueStats> {
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const pending = await repo.count({ where: { status: RunStatus.PENDING, channelId: String(ctx.channelId) } });
        const running = await repo.count({ where: { status: RunStatus.RUNNING, channelId: String(ctx.channelId) } });
        const failed = await repo.count({ where: { status: RunStatus.FAILED, channelId: String(ctx.channelId) } });

        const completedTodayQb = repo.createQueryBuilder('pr')
            .where('pr.status = :st', { st: RunStatus.COMPLETED })
            .andWhere('pr.channelId = :channelId', {
                channelId: String(ctx.channelId),
            })
            .andWhere('pr.finishedAt >= :mid', { mid: midnight.toISOString() });
        const completedToday = await completedTodayQb.getCount();

        // Use a single aggregated query with GROUP BY instead of N queries per pipeline
        const pipelineStats = await repo.createQueryBuilder('pr')
            .leftJoin('pr.pipeline', 'pipeline')
            .select('pipeline.code', 'code')
            .addSelect('pr.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('pr.status IN (:...statuses)', { statuses: [RunStatus.PENDING, RunStatus.RUNNING] })
            .andWhere('pr.channelId = :channelId', {
                channelId: String(ctx.channelId),
            })
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
            .andWhere('pr.channelId = :channelId', {
                channelId: String(ctx.channelId),
            })
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
    async dataHubConsumers(@Ctx() ctx: RequestContext): Promise<ConsumerStatus[]> {
        const statuses = await this.messageConsumer.getConsumerStatus();
        const pipelineCodes = [...new Set(statuses.map(status => status.pipelineCode))];
        const accessiblePipelines = await this.pipelineService.findByCodes(ctx, pipelineCodes);
        const accessibleCodes = new Set(accessiblePipelines.map(pipeline => pipeline.code));
        return statuses
            .filter(status => accessibleCodes.has(status.pipelineCode))
            .map(s => ({
                pipelineCode: s.pipelineCode,
                triggerKey: s.triggerKey,
                queueName: s.queueName,
                isActive: s.running,
                messagesProcessed: s.messagesProcessed,
                messagesFailed: s.messagesFailed,
                lastMessageAt: s.lastMessageAt ?? null,
                autoStart: s.autoStart,
                desiredEnabled: s.desiredEnabled,
            }));
    }

    @Mutation()
    @Allow(RunDataHubPipelinePermission.Permission)
    async startDataHubConsumer(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineCode: string; triggerKey?: string },
    ): Promise<boolean> {
        try {
            const pipeline = await this.pipelineService.findByCode(ctx, args.pipelineCode);
            if (!pipeline) return false;
            await this.executionPermissions.assertAllowed(ctx, pipeline.definition);
            await this.messageConsumer.startConsumerByCode(args.pipelineCode, args.triggerKey, ctx);
            return true;
        } catch (error) {
            this.logger.debug(`Consumer start failed for pipeline ${args.pipelineCode}`, {
                error,
                triggerKey: args.triggerKey,
            });
            return false;
        }
    }

    @Mutation()
    @Allow(RunDataHubPipelinePermission.Permission)
    async stopDataHubConsumer(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineCode: string; triggerKey?: string },
    ): Promise<boolean> {
        try {
            const pipeline = await this.pipelineService.findByCode(ctx, args.pipelineCode);
            if (!pipeline) return false;
            await this.messageConsumer.stopConsumerByCode(args.pipelineCode, args.triggerKey, ctx);
            return true;
        } catch (error) {
            this.logger.debug(`Consumer stop failed for pipeline ${args.pipelineCode}`, {
                error,
                triggerKey: args.triggerKey,
            });
            return false;
        }
    }
}
