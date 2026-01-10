import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In, LessThan, MoreThan } from 'typeorm';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { RevisionType } from '../../entities/pipeline/pipeline-revision.entity';
import { PipelineDefinition, RunStatus } from '../../types/index';
import {
    AutoSaveConfig,
    DEFAULT_AUTO_SAVE_CONFIG,
    PublishVersionOptions,
    RevertOptions,
    RevisionDiff,
    SaveDraftOptions,
    TimelineEntry,
} from '../../types/versioning.types';
import { DiffService } from './diff.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';

/**
 * Service for managing pipeline revisions with draft/publish workflow
 */
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

    /**
     * Configure auto-save behavior
     */
    setAutoSaveConfig(config: Partial<AutoSaveConfig>): void {
        this.autoSaveConfig = { ...this.autoSaveConfig, ...config };
    }

    /**
     * Save a draft revision (auto-save)
     * Throttled to prevent excessive saves
     */
    async saveDraft(ctx: RequestContext, options: SaveDraftOptions): Promise<PipelineRevision | null> {
        const { pipelineId, definition, authorUserId, authorName } = options;

        // Check throttle
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

        // Check if definition actually changed
        const definitionHash = this.diffService.computeDefinitionHash(definition);
        const latestDraft = await this.getLatestDraft(ctx, pipelineId);
        if (latestDraft?.definitionHash === definitionHash) {
            this.logger.debug('Draft unchanged, skipping save', { pipelineId });
            return latestDraft;
        }

        // Compute changes summary
        const previousDefinition = latestDraft?.definition ||
            (await this.getLatestPublished(ctx, pipelineId))?.definition ||
            null;
        const changesSummary = this.diffService.generateChangesSummary(previousDefinition, definition);

        // Create new draft revision
        const revision = new PipelineRevision({
            pipeline,
            pipelineId,
            version: 0, // Drafts use version 0
            type: 'draft' as RevisionType,
            definition,
            commitMessage: null,
            authorUserId: authorUserId || null,
            authorName: authorName || null,
            changesSummary,
            previousRevisionId: latestDraft ? (latestDraft.id as number) : null,
            definitionSize: this.diffService.calculateDefinitionSize(definition),
            definitionHash,
        });

        const saved = await revisionRepo.save(revision);

        // Update pipeline's draft reference
        pipeline.draftRevisionId = saved.id as number;
        pipeline.definition = definition;
        await pipelineRepo.save(pipeline);

        // Update throttle timestamp
        this.lastSaveTimestamps.set(pipelineId, now);

        // Prune old drafts if needed
        await this.pruneDrafts(ctx, pipelineId);

        this.logger.debug('Draft saved', {
            pipelineId,
            revisionId: saved.id,
            totalChanges: changesSummary.totalChanges,
        });

        return saved;
    }

    /**
     * Publish a new version with commit message
     */
    async publishVersion(ctx: RequestContext, options: PublishVersionOptions): Promise<PipelineRevision> {
        const { pipelineId, commitMessage, definition: inputDefinition, authorUserId, authorName } = options;

        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);

        const pipeline = await pipelineRepo.findOne({ where: { id: pipelineId } });
        if (!pipeline) {
            throw new Error(`Pipeline ${pipelineId} not found`);
        }

        // Use input definition or current pipeline definition
        const definition = inputDefinition || pipeline.definition;
        const definitionHash = this.diffService.computeDefinitionHash(definition);

        // Get previous published revision for diff
        const previousPublished = await this.getLatestPublished(ctx, pipelineId);
        const previousDefinition = previousPublished?.definition || null;
        const changesSummary = this.diffService.generateChangesSummary(previousDefinition, definition);

        // Increment version
        const newVersion = (pipeline.publishedVersionCount || 0) + 1;

        // Create published revision
        const revision = new PipelineRevision({
            pipeline,
            pipelineId,
            version: newVersion,
            type: 'published' as RevisionType,
            definition,
            commitMessage,
            authorUserId: authorUserId || (ctx.activeUserId as string) || null,
            authorName: authorName || null,
            changesSummary,
            previousRevisionId: previousPublished ? (previousPublished.id as number) : null,
            definitionSize: this.diffService.calculateDefinitionSize(definition),
            definitionHash,
        });

        const saved = await revisionRepo.save(revision);

        // Update pipeline
        pipeline.version = newVersion;
        pipeline.publishedVersionCount = newVersion;
        pipeline.currentRevisionId = saved.id as number;
        pipeline.definition = definition;
        pipeline.status = 'PUBLISHED';
        pipeline.publishedAt = new Date();
        pipeline.publishedByUserId = (authorUserId || ctx.activeUserId as string) || null;
        await pipelineRepo.save(pipeline);

        // Optionally prune drafts on publish
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

    /**
     * Revert to a specific revision
     */
    async revertToRevision(ctx: RequestContext, options: RevertOptions): Promise<PipelineRevision> {
        const { revisionId, commitMessage, authorUserId, authorName } = options;

        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);

        // Find the target revision
        const targetRevision = await revisionRepo.findOne({
            where: { id: revisionId },
            relations: ['pipeline'],
        });
        if (!targetRevision) {
            throw new Error(`Revision ${revisionId} not found`);
        }

        const pipeline = await pipelineRepo.findOne({ where: { id: targetRevision.pipelineId } });
        if (!pipeline) {
            throw new Error(`Pipeline for revision ${revisionId} not found`);
        }

        // Create a new published revision with the reverted definition
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

    /**
     * Get the timeline of revisions for a pipeline
     */
    async getTimeline(ctx: RequestContext, pipelineId: ID, limit = 50): Promise<TimelineEntry[]> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        const runRepo = this.connection.getRepository(ctx, PipelineRun);

        // Get revisions ordered by creation date
        const revisions = await revisionRepo.find({
            where: { pipelineId: pipelineId as number },
            order: { createdAt: 'DESC' },
            take: limit,
        });

        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { id: pipelineId },
        });

        const timeline: TimelineEntry[] = [];

        for (const revision of revisions) {
            // Get run statistics for this revision
            const runs = await runRepo.find({
                where: {
                    pipeline: { id: pipelineId },
                },
                order: { createdAt: 'DESC' },
            });

            // Filter runs that used this revision's version
            const revisionRuns = revision.type === 'published'
                ? runs.filter(r => {
                    // Match runs to published versions by comparing version numbers
                    // This is approximate - ideally runs would store the revision ID
                    return true; // For now, include all runs
                })
                : [];

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
                lastRunStatus: lastRun?.status === RunStatus.COMPLETED ? 'success'
                    : lastRun?.status === RunStatus.FAILED ? 'failed'
                    : null,
            });
        }

        return timeline;
    }

    /**
     * Get diff between two revisions
     */
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

    /**
     * Get the latest draft revision for a pipeline
     */
    async getLatestDraft(ctx: RequestContext, pipelineId: ID): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.findOne({
            where: {
                pipelineId: pipelineId as number,
                type: 'draft' as RevisionType,
            },
            order: { createdAt: 'DESC' },
        });
    }

    /**
     * Get the latest published revision for a pipeline
     */
    async getLatestPublished(ctx: RequestContext, pipelineId: ID): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.findOne({
            where: {
                pipelineId: pipelineId as number,
                type: 'published' as RevisionType,
            },
            order: { version: 'DESC' },
        });
    }

    /**
     * Get a specific revision by ID
     */
    async getRevision(ctx: RequestContext, revisionId: ID): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.findOne({
            where: { id: revisionId },
            relations: ['pipeline'],
        });
    }

    /**
     * Prune old draft revisions
     */
    async pruneDrafts(ctx: RequestContext, pipelineId: ID, clearAll = false): Promise<number> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);

        if (clearAll) {
            // Delete all drafts for this pipeline
            const result = await revisionRepo.delete({
                pipelineId: pipelineId as number,
                type: 'draft' as RevisionType,
            });
            return result.affected || 0;
        }

        // Get all drafts ordered by creation date
        const drafts = await revisionRepo.find({
            where: {
                pipelineId: pipelineId as number,
                type: 'draft' as RevisionType,
            },
            order: { createdAt: 'DESC' },
        });

        // Keep only the configured number of drafts
        const toDelete = drafts.slice(this.autoSaveConfig.maxDraftsToKeep);

        // Also delete drafts older than maxDraftAgeDays
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

    /**
     * Check if there are unpublished changes
     */
    async hasUnpublishedChanges(ctx: RequestContext, pipelineId: ID): Promise<boolean> {
        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { id: pipelineId },
        });
        if (!pipeline) return false;

        const latestPublished = await this.getLatestPublished(ctx, pipelineId);
        if (!latestPublished) {
            // No published version, so any content is unpublished
            return true;
        }

        const currentHash = this.diffService.computeDefinitionHash(pipeline.definition);
        return currentHash !== latestPublished.definitionHash;
    }

    /**
     * Get the number of published versions
     */
    async getPublishedVersionCount(ctx: RequestContext, pipelineId: ID): Promise<number> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.count({
            where: {
                pipelineId: pipelineId as number,
                type: 'published' as RevisionType,
            },
        });
    }

    /**
     * Restore a draft to the working copy
     */
    async restoreDraft(ctx: RequestContext, revisionId: ID): Promise<Pipeline> {
        const revision = await this.getRevision(ctx, revisionId);
        if (!revision) {
            throw new Error(`Revision ${revisionId} not found`);
        }
        if (revision.type !== 'draft') {
            throw new Error(`Revision ${revisionId} is not a draft`);
        }

        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await pipelineRepo.findOne({ where: { id: revision.pipelineId } });
        if (!pipeline) {
            throw new Error(`Pipeline for revision ${revisionId} not found`);
        }

        // Update pipeline with draft content
        pipeline.definition = revision.definition;
        pipeline.draftRevisionId = revision.id as number;
        await pipelineRepo.save(pipeline);

        return pipeline;
    }
}
