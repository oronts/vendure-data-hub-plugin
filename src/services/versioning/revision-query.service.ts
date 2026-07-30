import {
    ID,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import {
    RevisionDiff,
    TimelineEntry,
} from '../../types';
import {
    RevisionType,
    RunOutcome,
    RunStatus,
    SortOrder,
} from '../../constants/enums';
import { PAGINATION } from '../../constants';
import { PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { sanitizePipelineDefinitionForOutput } from '../validation/hook-security';
import { DiffService } from './diff.service';
import { RevisionChannelAccessService } from './revision-channel-access.service';

interface RevisionRunStats {
    runCount: number;
    lastRun: Pick<
        PipelineRun,
        'status' | 'startedAt' | 'finishedAt' | 'metrics'
    > | null;
}

interface RevisionRunCountRow {
    revisionId: ID;
    runCount: string | number;
}

export class RevisionQueryService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly diffService: DiffService,
        private readonly access: RevisionChannelAccessService,
    ) {}

    async getTimeline(
        ctx: RequestContext,
        pipelineId: ID,
        limit: number = PAGINATION.EVENTS_LIMIT,
    ): Promise<TimelineEntry[]> {
        if (
            !Number.isInteger(limit)
            || limit < 1
            || limit > PAGINATION.MAX_QUERY_LIMIT
        ) {
            throw new UserInputError(
                `limit must be an integer between 1 and ${PAGINATION.MAX_QUERY_LIMIT}`,
            );
        }
        const pipeline = await this.access.getPipeline(ctx, pipelineId);
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        const revisions = await revisionRepo.find({
            where: { pipelineId },
            select: [
                'id',
                'createdAt',
                'version',
                'type',
                'commitMessage',
                'authorName',
                'changesSummary',
            ],
            order: { createdAt: SortOrder.DESC },
            take: limit,
        });
        const runStats = await this.getRevisionRunStats(
            ctx,
            pipelineId,
            revisions,
        );

        return revisions.map(revision => {
            const stats = runStats.get(String(revision.id));
            const lastRun = stats?.lastRun;
            return {
                revision: {
                    id: revision.id,
                    createdAt: revision.createdAt,
                    version: revision.version,
                    type: revision.type,
                    commitMessage: revision.commitMessage,
                    authorName: revision.authorName,
                    changesSummary: revision.changesSummary,
                    isLatest: revision.id === pipeline.draftRevisionId
                        || revision.id === pipeline.currentRevisionId,
                    isCurrent: revision.id === pipeline.currentRevisionId,
                },
                runCount: stats?.runCount ?? 0,
                lastRunAt: lastRun?.finishedAt || lastRun?.startedAt || null,
                lastRunStatus: this.getRunOutcome(lastRun ?? null),
            };
        });
    }

    async getDiff(
        ctx: RequestContext,
        fromRevisionId: ID,
        toRevisionId: ID,
    ): Promise<RevisionDiff> {
        const fromRevision = await this.access.getRevision(ctx, fromRevisionId);
        const toRevision = await this.access.getRevision(ctx, toRevisionId);
        if (!fromRevision || !toRevision) {
            throw new Error('One or both revisions not found');
        }

        const diff = this.diffService.computeDiff(
            sanitizePipelineDefinitionForOutput(fromRevision.definition),
            sanitizePipelineDefinitionForOutput(toRevision.definition),
        );
        return {
            ...diff,
            fromVersion: fromRevision.version,
            toVersion: toRevision.version,
        };
    }

    async getLatestDraft(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<PipelineRevision | null> {
        await this.access.getPipeline(ctx, pipelineId);
        return this.connection.getRepository(ctx, PipelineRevision).findOne({
            where: { pipelineId, type: RevisionType.DRAFT },
            order: { createdAt: SortOrder.DESC },
        });
    }

    async getLatestPublished(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<PipelineRevision | null> {
        await this.access.getPipeline(ctx, pipelineId);
        return this.connection.getRepository(ctx, PipelineRevision).findOne({
            where: { pipelineId, type: RevisionType.PUBLISHED },
            order: { version: SortOrder.DESC },
        });
    }

    async getRevision(
        ctx: RequestContext,
        revisionId: ID,
    ): Promise<PipelineRevision | null> {
        const revision = await this.access.getRevision(ctx, revisionId);
        if (!revision) return null;
        const sanitized = Object.assign(new PipelineRevision(), revision);
        sanitized.definition = sanitizePipelineDefinitionForOutput(
            revision.definition,
        );
        return sanitized;
    }

    async hasUnpublishedChanges(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<boolean> {
        const pipeline = await this.access.findPipeline(ctx, pipelineId);
        if (!pipeline) return false;
        const latestPublished = await this.getLatestPublished(ctx, pipelineId);
        if (!latestPublished) return true;
        const currentHash = this.diffService.computeDefinitionHash(
            pipeline.definition,
        );
        return currentHash !== latestPublished.definitionHash;
    }

    async getPublishedVersionCount(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<number> {
        await this.access.getPipeline(ctx, pipelineId);
        return this.connection.getRepository(ctx, PipelineRevision).count({
            where: { pipelineId, type: RevisionType.PUBLISHED },
        });
    }

    private getRunOutcome(
        run: RevisionRunStats['lastRun'],
    ): RunOutcome | null {
        if (!run) return null;
        if (run.status === RunStatus.FAILED || run.status === RunStatus.TIMEOUT) {
            return RunOutcome.FAILED;
        }
        if (run.status !== RunStatus.COMPLETED) return null;
        return typeof run.metrics?.failed === 'number' && run.metrics.failed > 0
            ? RunOutcome.PARTIAL
            : RunOutcome.SUCCESS;
    }

    private async getRevisionRunStats(
        ctx: RequestContext,
        pipelineId: ID,
        revisions: readonly PipelineRevision[],
    ): Promise<Map<string, RevisionRunStats>> {
        const revisionIds = revisions
            .filter(revision => revision.type === RevisionType.PUBLISHED)
            .map(revision => revision.id);
        const stats = new Map<string, RevisionRunStats>();
        if (revisionIds.length === 0) return stats;

        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const countRows = await runRepo.createQueryBuilder('run')
            .select('run.revisionId', 'revisionId')
            .addSelect('COUNT(run.id)', 'runCount')
            .where('run.pipelineId = :pipelineId', { pipelineId })
            .andWhere('run.channelId = :channelId', {
                channelId: String(ctx.channelId),
            })
            .andWhere('run.revisionId IN (:...revisionIds)', { revisionIds })
            .groupBy('run.revisionId')
            .getRawMany<RevisionRunCountRow>();
        const counts = new Map(countRows.map(row => [
            String(row.revisionId),
            Number(row.runCount),
        ]));
        const latestRuns = await runRepo.createQueryBuilder('run')
            .select([
                'run.id',
                'run.revisionId',
                'run.status',
                'run.startedAt',
                'run.finishedAt',
                'run.createdAt',
                'run.metrics',
            ])
            .where('run.pipelineId = :pipelineId', { pipelineId })
            .andWhere('run.channelId = :channelId', {
                channelId: String(ctx.channelId),
            })
            .andWhere('run.revisionId IN (:...revisionIds)', { revisionIds })
            .andWhere(query => {
                const newerRun = query.subQuery()
                    .select('1')
                    .from(PipelineRun, 'newer')
                    .where('newer.pipelineId = run.pipelineId')
                    .andWhere('newer.channelId = run.channelId')
                    .andWhere('newer.revisionId = run.revisionId')
                    .andWhere(
                        '(newer.createdAt > run.createdAt OR '
                        + '(newer.createdAt = run.createdAt AND newer.id > run.id))',
                    )
                    .getQuery();
                return `NOT EXISTS ${newerRun}`;
            })
            .getMany();
        const latestRunsByRevision = new Map(latestRuns.map(run => [
            String(run.revisionId),
            run,
        ]));
        revisionIds.forEach(revisionId => {
            stats.set(String(revisionId), {
                runCount: counts.get(String(revisionId)) ?? 0,
                lastRun: latestRunsByRevision.get(String(revisionId)) ?? null,
            });
        });
        return stats;
    }
}
