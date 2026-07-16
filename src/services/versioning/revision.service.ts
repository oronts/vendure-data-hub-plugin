import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import {
    PipelineDefinition,
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
import { LOGGER_CONTEXTS, PAGINATION } from '../../constants/index';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { DiffService } from './diff.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { DomainEventsService } from '../events/domain-events.service';
import {
    assertPipelineStatus,
    definitionsEqual,
    normalizePipelineDefinition,
    statusAfterExecutableUpdate,
} from '../pipeline/pipeline-policy';
import {
    getMissingPipelinePermissions,
    withEffectivePipelineCapabilities,
} from '../pipeline/pipeline-capabilities';
import { sanitizePipelineDefinitionForOutput } from '../validation/hook-security';

const COMMIT_MESSAGE_MAX_LENGTH = 500;
const MAX_DRAFT_THROTTLE_ENTRIES = 1000;

interface PublicationMetadata {
    commitMessage?: string;
    authorUserId?: string;
    authorName?: string;
}

@Injectable()
export class RevisionService {
    private readonly logger: DataHubLogger;
    private autoSaveConfig: AutoSaveConfig = DEFAULT_AUTO_SAVE_CONFIG;
    private lastSaveTimestamps = new Map<ID, number>();

    constructor(
        private connection: TransactionalConnection,
        private diffService: DiffService,
        private definitionValidator: DefinitionValidationService,
        private registry: DataHubRegistryService,
        private domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    setAutoSaveConfig(config: Partial<AutoSaveConfig>): void {
        this.autoSaveConfig = { ...this.autoSaveConfig, ...config };
    }

    async saveDraft(
        ctx: RequestContext,
        options: SaveDraftOptions,
    ): Promise<PipelineRevision | null> {
        const definition = normalizePipelineDefinition(
            options.definition,
            options.definition.version,
        );
        this.definitionValidator.validate(definition);

        const lastSave = this.lastSaveTimestamps.get(options.pipelineId);
        const now = Date.now();
        if (lastSave && now - lastSave < this.autoSaveConfig.throttleMs) {
            this.logger.debug('Draft save throttled', {
                pipelineId: options.pipelineId,
                msSinceLastSave: now - lastSave,
            });
            return null;
        }

        const result = await this.connection.withTransaction(ctx, async transactionCtx => {
            const pipelineRepo = this.connection.getRepository(transactionCtx, Pipeline);
            const revisionRepo = this.connection.getRepository(transactionCtx, PipelineRevision);
            const pipeline = await pipelineRepo.findOne({
                where: { id: options.pipelineId },
            });
            if (!pipeline) {
                throw new Error(`Pipeline ${options.pipelineId} not found`);
            }

            const definitionHash = this.diffService.computeDefinitionHash(definition);
            const latestDraft = await this.getLatestDraft(
                transactionCtx,
                options.pipelineId,
            );
            if (latestDraft?.definitionHash === definitionHash) {
                this.logger.debug('Draft unchanged, skipping save', {
                    pipelineId: options.pipelineId,
                });
                return { revision: latestDraft, created: false };
            }

            const latestPublished = await this.getLatestPublished(
                transactionCtx,
                options.pipelineId,
            );
            const previousDefinition = latestDraft?.definition ??
                latestPublished?.definition ??
                null;
            const changesSummary = this.diffService.generateChangesSummary(
                previousDefinition,
                definition,
            );

            const revision = new PipelineRevision();
            revision.pipeline = pipeline;
            revision.pipelineId = options.pipelineId;
            revision.version = 0;
            revision.type = RevisionType.DRAFT;
            revision.definition = definition;
            revision.commitMessage = null;
            revision.authorUserId = transactionCtx.activeUserId?.toString() ??
                options.authorUserId ??
                null;
            revision.authorName = options.authorName ?? null;
            revision.changesSummary = changesSummary;
            revision.previousRevisionId = latestDraft
                ? latestDraft.id
                : pipeline.currentRevisionId;
            revision.definitionSize = this.diffService.calculateDefinitionSize(definition);
            revision.definitionHash = definitionHash;

            const saved = await revisionRepo.save(revision);
            const executableChanged = !definitionsEqual(
                pipeline.definition,
                definition,
            );
            pipeline.draftRevisionId = saved.id;
            pipeline.definition = definition;
            pipeline.status = statusAfterExecutableUpdate(
                pipeline.status,
                executableChanged,
            );
            await pipelineRepo.save(pipeline, { reload: false });
            await this.pruneDrafts(transactionCtx, options.pipelineId);

            this.logger.debug('Draft saved', {
                pipelineId: options.pipelineId,
                revisionId: saved.id,
                totalChanges: changesSummary.totalChanges,
            });
            return { revision: saved, created: true };
        });

        if (result.created) {
            if (this.lastSaveTimestamps.size >= MAX_DRAFT_THROTTLE_ENTRIES) {
                this.lastSaveTimestamps.clear();
            }
            this.lastSaveTimestamps.set(options.pipelineId, now);
        }
        return result.revision;
    }

    async publishVersion(
        ctx: RequestContext,
        options: PublishVersionOptions,
    ): Promise<PipelineRevision> {
        return this.connection.withTransaction(ctx, async transactionCtx => {
            const pipeline = await this.connection.getRepository(transactionCtx, Pipeline).findOne({
                where: { id: options.pipelineId },
            });
            if (!pipeline) {
                throw new Error(`Pipeline ${options.pipelineId} not found`);
            }
            assertPipelineStatus(
                pipeline.status,
                [PipelineStatus.DRAFT, PipelineStatus.REVIEW],
                'publish',
            );

            const definition = normalizePipelineDefinition(
                pipeline.definition,
                pipeline.definition.version,
            );
            if (options.definition) {
                const requestedDefinition = normalizePipelineDefinition(
                    options.definition,
                    definition.version,
                );
                if (!definitionsEqual(definition, requestedDefinition)) {
                    throw new Error('Save the pipeline definition as a draft before publishing');
                }
            }

            return this.commitPublishedRevision(
                transactionCtx,
                pipeline,
                definition,
                options,
            );
        });
    }

    async revertToRevision(
        ctx: RequestContext,
        options: RevertOptions,
    ): Promise<PipelineRevision> {
        return this.connection.withTransaction(ctx, async transactionCtx => {
            const revisionRepo = this.connection.getRepository(transactionCtx, PipelineRevision);
            const pipelineRepo = this.connection.getRepository(transactionCtx, Pipeline);
            const targetRevision = await revisionRepo.findOne({
                where: { id: options.revisionId },
            });
            if (!targetRevision) {
                throw new Error(`Revision ${options.revisionId} not found`);
            }
            if (!targetRevision.pipelineId) {
                throw new Error(`Revision ${options.revisionId} has no associated pipeline`);
            }

            const pipeline = await pipelineRepo.findOne({
                where: { id: targetRevision.pipelineId },
            });
            if (!pipeline) {
                throw new Error(`Pipeline for revision ${options.revisionId} not found`);
            }
            assertPipelineStatus(
                pipeline.status,
                [
                    PipelineStatus.DRAFT,
                    PipelineStatus.REVIEW,
                    PipelineStatus.PUBLISHED,
                ],
                'revert',
            );

            const commitMessage = options.commitMessage ??
                `Reverted to version ${targetRevision.version || 'draft'} (revision #${options.revisionId})`;

            return this.commitPublishedRevision(
                transactionCtx,
                pipeline,
                targetRevision.definition,
                {
                    ...options,
                    commitMessage,
                },
            );
        });
    }

    private async commitPublishedRevision(
        ctx: RequestContext,
        pipeline: Pipeline,
        candidateDefinition: PipelineDefinition,
        metadata: PublicationMetadata,
    ): Promise<PipelineRevision> {
        const definition = withEffectivePipelineCapabilities(
            this.registry,
            normalizePipelineDefinition(candidateDefinition, candidateDefinition.version),
        );
        this.definitionValidator.validate(definition);
        this.assertCapabilitiesAllowed(ctx, definition);

        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);
        let previousPublished: PipelineRevision | null = null;
        if (pipeline.currentRevisionId != null) {
            previousPublished = await revisionRepo.findOne({
                where: {
                    id: pipeline.currentRevisionId,
                    pipelineId: pipeline.id,
                    type: RevisionType.PUBLISHED,
                },
            });
            if (!previousPublished) {
                throw new Error(`Active revision not found for pipeline "${pipeline.code}"`);
            }
        }

        const commitMessage = metadata.commitMessage?.trim() || null;
        if (commitMessage && commitMessage.length > COMMIT_MESSAGE_MAX_LENGTH) {
            throw new Error(
                `Commit message must not exceed ${COMMIT_MESSAGE_MAX_LENGTH} characters`,
            );
        }

        const newVersion = (pipeline.publishedVersionCount ?? 0) + 1;
        const revision = new PipelineRevision();
        revision.pipeline = pipeline;
        revision.pipelineId = pipeline.id;
        revision.version = newVersion;
        revision.type = RevisionType.PUBLISHED;
        revision.definition = definition;
        revision.commitMessage = commitMessage;
        revision.authorUserId = ctx.activeUserId?.toString() ?? metadata.authorUserId ?? null;
        revision.authorName = metadata.authorName ?? null;
        revision.changesSummary = this.diffService.generateChangesSummary(
            previousPublished?.definition ?? null,
            definition,
        );
        revision.previousRevisionId = previousPublished?.id ?? null;
        revision.definitionSize = this.diffService.calculateDefinitionSize(definition);
        revision.definitionHash = this.diffService.computeDefinitionHash(definition);

        const saved = await revisionRepo.save(revision);

        pipeline.version = newVersion;
        pipeline.publishedVersionCount = newVersion;
        pipeline.currentRevisionId = saved.id;
        pipeline.draftRevisionId = null;
        pipeline.definition = definition;
        pipeline.status = PipelineStatus.PUBLISHED;
        pipeline.publishedAt = new Date();
        pipeline.publishedByUserId = revision.authorUserId;
        await pipelineRepo.save(pipeline, { reload: false });

        if (this.autoSaveConfig.pruneOnPublish) {
            await this.pruneDrafts(ctx, pipeline.id, true);
        }

        this.domainEvents.publishPipelinePublished(
            pipeline.id.toString(),
            pipeline.code,
        );
        this.logger.info('Version published', {
            pipelineId: pipeline.id,
            pipelineCode: pipeline.code,
            version: newVersion,
            revisionId: saved.id,
            totalChanges: revision.changesSummary?.totalChanges ?? 0,
        });

        return saved;
    }

    private assertCapabilitiesAllowed(
        ctx: RequestContext,
        definition: PipelineDefinition,
    ): void {
        const missing = getMissingPipelinePermissions(this.registry, ctx, definition);
        if (!missing.length) {
            return;
        }

        this.logger.warn('Pipeline requires permissions not held by user', {
            userId: ctx.activeUserId,
            missing,
        });
        throw new Error(`Missing required permissions for this pipeline: ${missing.join(', ')}`);
    }

    async getTimeline(ctx: RequestContext, pipelineId: ID, limit: number = PAGINATION.EVENTS_LIMIT): Promise<TimelineEntry[]> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        const runRepo = this.connection.getRepository(ctx, PipelineRun);

        const revisions = await revisionRepo.find({
            where: { pipelineId },
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
                    id: revision.id,
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

    async getLatestDraft(ctx: RequestContext, pipelineId: ID): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.findOne({
            where: {
                pipelineId,
                type: RevisionType.DRAFT,
            },
            order: { createdAt: SortOrder.DESC },
        });
    }

    async getLatestPublished(ctx: RequestContext, pipelineId: ID): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.findOne({
            where: {
                pipelineId,
                type: RevisionType.PUBLISHED,
            },
            order: { version: SortOrder.DESC },
        });
    }

    async getRevision(ctx: RequestContext, revisionId: ID): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        const revision = await revisionRepo.findOne({
            where: { id: revisionId },
            relations: ['pipeline'],
        });
        if (!revision) return null;
        const sanitized = Object.assign(new PipelineRevision(), revision);
        sanitized.definition = sanitizePipelineDefinitionForOutput(revision.definition);
        return sanitized;
    }

    async pruneDrafts(ctx: RequestContext, pipelineId: ID, clearAll = false): Promise<number> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);

        if (clearAll) {
            const result = await revisionRepo.delete({
                pipelineId,
                type: RevisionType.DRAFT,
            });
            return result.affected || 0;
        }

        const drafts = await revisionRepo.find({
            where: {
                pipelineId,
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
                pipelineId,
                type: RevisionType.PUBLISHED,
            },
        });
    }

    async restoreDraft(ctx: RequestContext, revisionId: ID): Promise<Pipeline> {
        return this.connection.withTransaction(ctx, async transactionCtx => {
            const revisionRepo = this.connection.getRepository(transactionCtx, PipelineRevision);
            const pipelineRepo = this.connection.getRepository(transactionCtx, Pipeline);
            const revision = await revisionRepo.findOne({
                where: {
                    id: revisionId,
                    type: RevisionType.DRAFT,
                },
            });
            if (!revision) {
                throw new Error(`Draft revision ${revisionId} not found`);
            }
            if (!revision.pipelineId) {
                throw new Error(`Revision ${revisionId} has no associated pipeline`);
            }

            const pipeline = await pipelineRepo.findOne({
                where: { id: revision.pipelineId },
            });
            if (!pipeline) {
                throw new Error(`Pipeline for revision ${revisionId} not found`);
            }

            const definition = normalizePipelineDefinition(
                revision.definition,
                revision.definition.version,
            );
            this.definitionValidator.validate(definition);
            const executableChanged = !definitionsEqual(
                pipeline.definition,
                definition,
            );
            pipeline.definition = definition;
            pipeline.draftRevisionId = revision.id;
            pipeline.status = statusAfterExecutableUpdate(
                pipeline.status,
                executableChanged,
            );
            await pipelineRepo.save(pipeline, { reload: false });
            return pipeline;
        });
    }
}
