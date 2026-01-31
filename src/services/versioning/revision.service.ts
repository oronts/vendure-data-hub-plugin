import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import {
    RunStatus,
    AutoSaveConfig,
    DEFAULT_AUTO_SAVE_CONFIG,
    PublishVersionOptions,
    RevertOptions,
    RevisionDiff,
    SaveDraftOptions,
    TimelineEntry,
} from '../../types/index';
import { PipelineStatus, RevisionType, RunOutcome, SortOrder } from '../../constants/enums';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { DiffService } from './diff.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

@Injectable()
export class RevisionService {
    private readonly logger: DataHubLogger;
    private autoSaveConfig: AutoSaveConfig = DEFAULT_AUTO_SAVE_CONFIG;
    private lastSaveTimestamps = new Map<number, number>();

    constructor(
        private connection: TransactionalConnection,
        private diffService: DiffService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    setAutoSaveConfig(config: Partial<AutoSaveConfig>): void {
        this.autoSaveConfig = { ...this.autoSaveConfig, ...config };
    }

    async saveDraft(ctx: RequestContext, options: SaveDraftOptions): Promise<PipelineRevision | null> {
        const { pipelineId, definition, authorUserId, authorName } = options;

        const lastSave = this.lastSaveTimestamps.get(pipelineId);
        const now = Date.now();
        if (lastSave && now - lastSave < this.autoSaveConfig.throttleMs) {
            this.logger.debug('Draft save throttled', { pipelineId, msSinceLastSave: now - lastSave });
            return null;
        }

        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);

        const pipeline = await pipelineRepo.findOne({ where: { id: pipelineId } });
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }

        const definitionHash = this.diffService.computeDefinitionHash(definition);
        const latestDraft = await this.getLatestDraft(ctx, pipelineId);
        if (latestDraft?.definitionHash === definitionHash) {
            this.logger.debug('Draft unchanged, skipping save', { pipelineId });
            return latestDraft;
        }

        const previousDefinition = latestDraft?.definition ||
            (await this.getLatestPublished(ctx, pipelineId))?.definition ||
            null;
        const changesSummary = this.diffService.generateChangesSummary(previousDefinition, definition);

        const revision = new PipelineRevision();
        revision.pipeline = pipeline;
        revision.pipelineId = pipelineId;
        revision.version = 0;
        revision.type = RevisionType.DRAFT;
        revision.definition = definition;
        revision.commitMessage = null;
        revision.authorUserId = authorUserId || null;
        revision.authorName = authorName || null;
        revision.changesSummary = changesSummary;
        revision.previousRevisionId = latestDraft ? (latestDraft.id as number) : null;
        revision.definitionSize = this.diffService.calculateDefinitionSize(definition);
        revision.definitionHash = definitionHash;

        const saved = await revisionRepo.save(revision);

        pipeline.draftRevisionId = saved.id as number;
        pipeline.definition = definition;
        await pipelineRepo.save(pipeline);

        this.lastSaveTimestamps.set(pipelineId, now);
        await this.pruneDrafts(ctx, pipelineId);

        this.logger.debug('Draft saved', {
            pipelineId,
            revisionId: saved.id,
            totalChanges: changesSummary.totalChanges,
        });

        return saved;
    }

    async publishVersion(ctx: RequestContext, options: PublishVersionOptions): Promise<PipelineRevision> {
        const { pipelineId, commitMessage, definition: inputDefinition, authorUserId, authorName } = options;

        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);

        const pipeline = await pipelineRepo.findOne({ where: { id: pipelineId } });
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }

        const definition = inputDefinition || pipeline.definition;
        const definitionHash = this.diffService.computeDefinitionHash(definition);

        const previousPublished = await this.getLatestPublished(ctx, pipelineId);
        const previousDefinition = previousPublished?.definition || null;
        const changesSummary = this.diffService.generateChangesSummary(previousDefinition, definition);

        const newVersion = (pipeline.publishedVersionCount || 0) + 1;

        const revision = new PipelineRevision();
        revision.pipeline = pipeline;
        revision.pipelineId = pipelineId;
        revision.version = newVersion;
        revision.type = RevisionType.PUBLISHED;
        revision.definition = definition;
        revision.commitMessage = commitMessage;
        revision.authorUserId = authorUserId || (ctx.activeUserId as string) || null;
        revision.authorName = authorName || null;
        revision.changesSummary = changesSummary;
        revision.previousRevisionId = previousPublished ? (previousPublished.id as number) : null;
        revision.definitionSize = this.diffService.calculateDefinitionSize(definition);
        revision.definitionHash = definitionHash;

        const saved = await revisionRepo.save(revision);

        pipeline.version = newVersion;
        pipeline.publishedVersionCount = newVersion;
        pipeline.currentRevisionId = saved.id as number;
        pipeline.definition = definition;
        pipeline.status = PipelineStatus.PUBLISHED;
        pipeline.publishedAt = new Date();
        pipeline.publishedByUserId = (authorUserId || ctx.activeUserId as string) || null;
        await pipelineRepo.save(pipeline);

        if (this.autoSaveConfig.pruneOnPublish) {
            await this.pruneDrafts(ctx, pipelineId, true);
        }

        this.logger.info('Version published', {
            pipelineId,
            pipelineCode: pipeline.code,
            version: newVersion,
            revisionId: saved.id,
            totalChanges: changesSummary.totalChanges,
        });

        return saved;
    }

    async revertToRevision(ctx: RequestContext, options: RevertOptions): Promise<PipelineRevision> {
        const { revisionId, commitMessage, authorUserId, authorName } = options;

        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);

        const targetRevision = await revisionRepo.findOne({
            where: { id: revisionId },
            relations: ['pipeline'],
        });
        if (!targetRevision) {
            throw new Error(`Revision ${revisionId} not found`);
        }

        if (!targetRevision.pipelineId) {
            throw new Error(`Revision ${revisionId} has no associated pipeline`);
        }
        const pipeline = await pipelineRepo.findOne({ where: { id: targetRevision.pipelineId } });
        if (!pipeline) {
            throw new Error(`Pipeline for revision ${revisionId} not found`);
        }

        const revertMessage = commitMessage ||
            `Reverted to version ${targetRevision.version || 'draft'} (revision #${revisionId})`;

        return this.publishVersion(ctx, {
            pipelineId: pipeline.id as number,
            commitMessage: revertMessage,
            definition: targetRevision.definition,
            authorUserId,
            authorName,
        });
    }

    async getTimeline(ctx: RequestContext, pipelineId: ID, limit = 50): Promise<TimelineEntry[]> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        const runRepo = this.connection.getRepository(ctx, PipelineRun);

        const revisions = await revisionRepo.find({
            where: { pipelineId: pipelineId as number },
            order: { createdAt: SortOrder.DESC },
            take: limit,
        });

        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { id: pipelineId },
        });

        // Pre-fetch all runs for the pipeline in a single query
        const allRuns = await runRepo.find({
            where: { pipeline: { id: pipelineId } },
            order: { createdAt: SortOrder.DESC },
        });

        const timeline: TimelineEntry[] = [];

        for (const revision of revisions) {
            // For published revisions, use all runs; for drafts, no runs
            const revisionRuns = revision.type === RevisionType.PUBLISHED ? allRuns : [];

            const lastRun = revisionRuns[0];

            timeline.push({
                revision: {
                    id: revision.id as number,
                    createdAt: revision.createdAt,
                    version: revision.version,
                    type: revision.type,
                    commitMessage: revision.commitMessage,
                    authorName: revision.authorName,
                    changesSummary: revision.changesSummary,
                    isLatest: revision.id === pipeline?.draftRevisionId || revision.id === pipeline?.currentRevisionId,
                    isCurrent: revision.id === pipeline?.currentRevisionId,
                },
                runCount: revisionRuns.length,
                lastRunAt: lastRun?.finishedAt || lastRun?.startedAt || null,
                lastRunStatus: lastRun?.status === RunStatus.COMPLETED ? RunOutcome.SUCCESS
                    : lastRun?.status === RunStatus.FAILED ? RunOutcome.FAILED
                    : null,
            });
        }

        return timeline;
    }

    async getDiff(ctx: RequestContext, fromRevisionId: ID, toRevisionId: ID): Promise<RevisionDiff> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);

        const fromRevision = await revisionRepo.findOne({ where: { id: fromRevisionId } });
        const toRevision = await revisionRepo.findOne({ where: { id: toRevisionId } });

        if (!fromRevision || !toRevision) {
            throw new Error('One or both revisions not found');
        }

        const diff = this.diffService.computeDiff(fromRevision.definition, toRevision.definition);

        return {
            ...diff,
            fromVersion: fromRevision.version,
            toVersion: toRevision.version,
        };
    }

    async getLatestDraft(ctx: RequestContext, pipelineId: ID): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.findOne({
            where: {
                pipelineId: pipelineId as number,
                type: RevisionType.DRAFT,
            },
            order: { createdAt: SortOrder.DESC },
        });
    }

    async getLatestPublished(ctx: RequestContext, pipelineId: ID): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.findOne({
            where: {
                pipelineId: pipelineId as number,
                type: RevisionType.PUBLISHED,
            },
            order: { version: SortOrder.DESC },
        });
    }

    async getRevision(ctx: RequestContext, revisionId: ID): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.findOne({
            where: { id: revisionId },
            relations: ['pipeline'],
        });
    }

    async pruneDrafts(ctx: RequestContext, pipelineId: ID, clearAll = false): Promise<number> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);

        if (clearAll) {
            const result = await revisionRepo.delete({
                pipelineId: pipelineId as number,
                type: RevisionType.DRAFT,
            });
            return result.affected || 0;
        }

        const drafts = await revisionRepo.find({
            where: {
                pipelineId: pipelineId as number,
                type: RevisionType.DRAFT,
            },
            order: { createdAt: SortOrder.DESC },
        });

        const toDelete = drafts.slice(this.autoSaveConfig.maxDraftsToKeep);

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.autoSaveConfig.maxDraftAgeDays);

        const oldDrafts = drafts.filter(d => d.createdAt < cutoffDate);
        const allToDelete = [...new Set([...toDelete, ...oldDrafts])];

        if (allToDelete.length > 0) {
            await revisionRepo.delete({
                id: In(allToDelete.map(d => d.id)),
            });
            this.logger.debug('Pruned drafts', {
                pipelineId,
                prunedCount: allToDelete.length,
            });
        }

        return allToDelete.length;
    }

    async hasUnpublishedChanges(ctx: RequestContext, pipelineId: ID): Promise<boolean> {
        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { id: pipelineId },
        });
        if (!pipeline) return false;

        const latestPublished = await this.getLatestPublished(ctx, pipelineId);
        if (!latestPublished) {
            return true;
        }

        const currentHash = this.diffService.computeDefinitionHash(pipeline.definition);
        return currentHash !== latestPublished.definitionHash;
    }

    async getPublishedVersionCount(ctx: RequestContext, pipelineId: ID): Promise<number> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.count({
            where: {
                pipelineId: pipelineId as number,
                type: RevisionType.PUBLISHED,
            },
        });
    }

    async restoreDraft(ctx: RequestContext, revisionId: ID): Promise<Pipeline> {
        const revision = await this.getRevision(ctx, revisionId);
        if (!revision) {
            throw new Error(`Revision ${revisionId} not found`);
        }
        if (revision.type !== RevisionType.DRAFT) {
            throw new Error(`Revision ${revisionId} is not a draft`);
        }
        if (!revision.pipelineId) {
            throw new Error(`Revision ${revisionId} has no associated pipeline`);
        }

        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await pipelineRepo.findOne({ where: { id: revision.pipelineId } });
        if (!pipeline) {
            throw new Error(`Pipeline for revision ${revisionId} not found`);
        }

        pipeline.definition = revision.definition;
        pipeline.draftRevisionId = revision.id as number;
        await pipelineRepo.save(pipeline);

        return pipeline;
    }
}
