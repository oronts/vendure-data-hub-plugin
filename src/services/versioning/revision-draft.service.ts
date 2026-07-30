import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import {
    AutoSaveConfig,
    DEFAULT_AUTO_SAVE_CONFIG,
    SaveDraftOptions,
} from '../../types';
import {
    PipelineStatus,
    RevisionType,
    SortOrder,
} from '../../constants/enums';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import { DiffService } from './diff.service';
import { DataHubLogger } from '../logger';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import {
    definitionsEqual,
    normalizePipelineDefinition,
    statusAfterExecutableUpdate,
} from '../pipeline/pipeline-policy';
import {
    advancePipelineRowVersion,
    createPipelineWriteGuard,
} from '../pipeline/pipeline-write-guard';
import { assertDatabaseConfiguration } from '../config/configuration-ownership';
import { RevisionChannelAccessService } from './revision-channel-access.service';

export class RevisionDraftService {
    private autoSaveConfig: AutoSaveConfig = DEFAULT_AUTO_SAVE_CONFIG;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly diffService: DiffService,
        private readonly definitionValidator: DefinitionValidationService,
        private readonly access: RevisionChannelAccessService,
        private readonly logger: DataHubLogger,
    ) {}

    setAutoSaveConfig(config: Partial<AutoSaveConfig>): void {
        this.autoSaveConfig = { ...this.autoSaveConfig, ...config };
    }

    shouldPruneOnPublish(): boolean {
        return this.autoSaveConfig.pruneOnPublish;
    }

    async saveDraft(
        ctx: RequestContext,
        options: SaveDraftOptions,
    ): Promise<PipelineRevision | null> {
        if (!this.autoSaveConfig.enabled) {
            return null;
        }
        const definition = normalizePipelineDefinition(
            options.definition,
            options.definition.version,
        );
        this.definitionValidator.validate(definition);

        return this.connection.withTransaction(ctx, async transactionCtx => {
            const pipelineRepo = this.connection.getRepository(transactionCtx, Pipeline);
            const revisionRepo = this.connection.getRepository(transactionCtx, PipelineRevision);
            const pipeline = await this.access.getPipeline(
                transactionCtx,
                options.pipelineId,
            );
            assertDatabaseConfiguration(
                pipeline.configurationSource,
                'Pipeline',
                pipeline.code,
                'changed through draft editing',
            );
            if (pipeline.status === PipelineStatus.ARCHIVED) {
                throw new Error('Cannot save a draft for an archived pipeline; reactivate it first');
            }
            const writeGuard = createPipelineWriteGuard(pipeline);

            const definitionHash = this.diffService.computeDefinitionHash(definition);
            const latestDraft = await this.findLatestRevision(
                transactionCtx,
                options.pipelineId,
                RevisionType.DRAFT,
            );
            if (latestDraft?.definitionHash === definitionHash) {
                this.logger.debug('Draft unchanged, skipping save', {
                    pipelineId: options.pipelineId,
                });
                return latestDraft;
            }

            const latestPublished = await this.findLatestRevision(
                transactionCtx,
                options.pipelineId,
                RevisionType.PUBLISHED,
            );
            const previousDefinition = latestDraft?.definition
                ?? latestPublished?.definition
                ?? null;
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
            revision.authorUserId = transactionCtx.activeUserId?.toString()
                ?? options.authorUserId
                ?? null;
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
            const nextStatus = statusAfterExecutableUpdate(
                pipeline.status,
                executableChanged,
            );
            const pipelineUpdate = await pipelineRepo.update(
                writeGuard,
                {
                    draftRevisionId: saved.id,
                    definition: definition as never,
                    status: nextStatus,
                },
            );
            if (pipelineUpdate.affected !== 1) {
                throw new Error(
                    `Pipeline "${pipeline.code}" changed concurrently; reload before saving the draft`,
                );
            }
            pipeline.draftRevisionId = saved.id;
            pipeline.definition = definition;
            pipeline.status = nextStatus;
            advancePipelineRowVersion(pipeline);
            await this.pruneDrafts(transactionCtx, options.pipelineId);

            this.logger.debug('Draft saved', {
                pipelineId: options.pipelineId,
                revisionId: saved.id,
                totalChanges: changesSummary.totalChanges,
            });
            return saved;
        });
    }

    async pruneDrafts(
        ctx: RequestContext,
        pipelineId: ID,
        clearAll = false,
    ): Promise<number> {
        const pipeline = await this.access.getPipeline(ctx, pipelineId);
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
        cutoffDate.setDate(
            cutoffDate.getDate() - this.autoSaveConfig.maxDraftAgeDays,
        );
        const oldDrafts = drafts.filter(draft => draft.createdAt < cutoffDate);
        const activeDraftId = pipeline.draftRevisionId?.toString();
        const allToDelete = [...new Set([...toDelete, ...oldDrafts])]
            .filter(draft => draft.id.toString() !== activeDraftId);

        if (allToDelete.length > 0) {
            await revisionRepo.delete({
                id: In(allToDelete.map(draft => draft.id)),
            });
            this.logger.debug('Pruned drafts', {
                pipelineId,
                prunedCount: allToDelete.length,
            });
        }
        return allToDelete.length;
    }

    async restoreDraft(
        ctx: RequestContext,
        revisionId: ID,
    ): Promise<Pipeline> {
        return this.connection.withTransaction(ctx, async transactionCtx => {
            const pipelineRepo = this.connection.getRepository(transactionCtx, Pipeline);
            const revision = await this.access.getRevision(
                transactionCtx,
                revisionId,
                RevisionType.DRAFT,
            );
            if (!revision) {
                throw new Error(`Draft revision ${revisionId} not found`);
            }
            if (!revision.pipelineId) {
                throw new Error(`Revision ${revisionId} has no associated pipeline`);
            }

            const pipeline = await this.access.getPipeline(
                transactionCtx,
                revision.pipelineId,
            );
            assertDatabaseConfiguration(
                pipeline.configurationSource,
                'Pipeline',
                pipeline.code,
                'changed through draft restore',
            );
            if (pipeline.status === PipelineStatus.ARCHIVED) {
                throw new Error('Cannot restore a draft for an archived pipeline; reactivate it first');
            }
            const writeGuard = createPipelineWriteGuard(pipeline);
            const definition = normalizePipelineDefinition(
                revision.definition,
                revision.definition.version,
            );
            this.definitionValidator.validate(definition);
            const executableChanged = !definitionsEqual(
                pipeline.definition,
                definition,
            );
            const nextStatus = statusAfterExecutableUpdate(
                pipeline.status,
                executableChanged,
            );
            const pipelineUpdate = await pipelineRepo.update(
                writeGuard,
                {
                    definition: definition as never,
                    draftRevisionId: revision.id,
                    status: nextStatus,
                },
            );
            if (pipelineUpdate.affected !== 1) {
                throw new Error(
                    `Pipeline "${pipeline.code}" changed concurrently; reload before restoring the draft`,
                );
            }
            pipeline.definition = definition;
            pipeline.draftRevisionId = revision.id;
            pipeline.status = nextStatus;
            advancePipelineRowVersion(pipeline);
            return pipeline;
        });
    }

    private findLatestRevision(
        ctx: RequestContext,
        pipelineId: ID,
        type: RevisionType,
    ): Promise<PipelineRevision | null> {
        const revisionRepo = this.connection.getRepository(ctx, PipelineRevision);
        return revisionRepo.findOne({
            where: { pipelineId, type },
            order: type === RevisionType.PUBLISHED
                ? { version: SortOrder.DESC }
                : { createdAt: SortOrder.DESC },
        });
    }
}
