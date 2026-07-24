import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    UserInputError,
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
import {
    ConfigurationSource,
    PipelineStatus,
    RevisionType,
    RunOutcome,
    SortOrder,
} from '../../constants/enums';
import { LOGGER_CONTEXTS, PAGINATION } from '../../constants/index';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { DiffService } from './diff.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import {
    DefinitionValidationService,
    ValidationLevel,
} from '../validation/definition-validation.service';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { PublishDataHubPipelinePermission } from '../../permissions';
import { DomainEventsService } from '../events/domain-events.service';
import {
    assertPipelineStatus,
    definitionsEqual,
    normalizePipelineDefinition,
    statusAfterExecutableUpdate,
} from '../pipeline/pipeline-policy';
import {
    withEffectivePipelineCapabilities,
} from '../pipeline/pipeline-capabilities';
import { PipelineExecutionPermissionService } from '../pipeline/pipeline-execution-permission.service';
import { sanitizePipelineDefinitionForOutput } from '../validation/hook-security';
import { PipelineDefinitionError } from '../../validation/pipeline-definition-error';
import { findReachableDependencyCycle } from '../pipeline/pipeline-dependency-graph';
import { loadActivePipelineDefinitions } from '../pipeline/active-pipeline-definitions';
import {
    advancePipelineRowVersion,
    createPipelineWriteGuard,
} from '../pipeline/pipeline-write-guard';
import { assertDatabaseConfiguration } from '../config/configuration-ownership';
import { withResolvedAdapterBindings } from '../../sdk/adapter-bindings';

const COMMIT_MESSAGE_MAX_LENGTH = 500;
const MAX_DRAFT_THROTTLE_ENTRIES = 1000;

interface PublicationMetadata {
    commitMessage?: string;
    authorUserId?: string;
    authorName?: string;
    skipPermissionCheck?: boolean;
}

interface RevisionRunStats {
    runCount: number;
    lastRun: Pick<PipelineRun, 'status' | 'startedAt' | 'finishedAt' | 'metrics'> | null;
}

interface RevisionRunCountRow {
    revisionId: ID;
    runCount: string | number;
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
        private executionPermissions: PipelineExecutionPermissionService,
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

        const now = Date.now();

        const result = await this.connection.withTransaction(ctx, async transactionCtx => {
            const pipelineRepo = this.connection.getRepository(transactionCtx, Pipeline);
            const revisionRepo = this.connection.getRepository(transactionCtx, PipelineRevision);
            const pipeline = await pipelineRepo.findOne({
                where: { id: options.pipelineId },
            });
            if (!pipeline) {
                throw new Error(`Pipeline ${options.pipelineId} not found`);
            }
            assertDatabaseConfiguration(
                pipeline.configurationSource,
                'Pipeline',
                pipeline.code,
                'changed through draft editing',
            );
            if (pipeline.status === PipelineStatus.ARCHIVED) {
                throw new Error('Cannot save a draft for an archived pipeline; reactivate it first');
            }
            const lastSave = this.lastSaveTimestamps.get(options.pipelineId);
            if (lastSave && now - lastSave < this.autoSaveConfig.throttleMs) {
                this.logger.debug('Draft save throttled', {
                    pipelineId: options.pipelineId,
                    msSinceLastSave: now - lastSave,
                });
                return { revision: null, created: false };
            }
            const writeGuard = createPipelineWriteGuard(pipeline);

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
                [PipelineStatus.REVIEW],
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

    async refreshCodeFirstPublishedDefinition(
        ctx: RequestContext,
        pipelineId: ID,
        definition: PipelineDefinition,
    ): Promise<PipelineRevision> {
        return this.connection.withTransaction(ctx, async transactionCtx => {
            const pipeline = await this.connection
                .getRepository(transactionCtx, Pipeline)
                .findOne({ where: { id: pipelineId } });
            if (!pipeline) {
                throw new Error(`Pipeline ${pipelineId} not found`);
            }
            if (pipeline.configurationSource !== ConfigurationSource.CODE_FIRST) {
                throw new Error(
                    `Pipeline "${pipeline.code}" is not managed by code-first configuration`,
                );
            }
            if (
                pipeline.status !== PipelineStatus.PUBLISHED
                || pipeline.currentRevisionId == null
            ) {
                throw new Error(
                    `Pipeline "${pipeline.code}" has no published revision to refresh`,
                );
            }
            return this.commitPublishedRevision(
                transactionCtx,
                pipeline,
                definition,
                {
                    commitMessage: 'Refresh adapter contracts',
                    authorName: 'Data Hub config sync',
                    skipPermissionCheck: true,
                },
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
            assertDatabaseConfiguration(
                pipeline.configurationSource,
                'Pipeline',
                pipeline.code,
                'reverted',
            );
            assertPipelineStatus(
                pipeline.status,
                [PipelineStatus.PUBLISHED],
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
        const definition = withResolvedAdapterBindings(
            this.registry,
            withEffectivePipelineCapabilities(
                this.registry,
                normalizePipelineDefinition(candidateDefinition, candidateDefinition.version),
            ),
        );
        await this.assertPublicationDefinition(ctx, pipeline, definition);
        if (metadata.skipPermissionCheck !== true) {
            await this.executionPermissions.assertAllowed(
                ctx,
                definition,
                PublishDataHubPipelinePermission.Permission,
            );
        }

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
        const allocation = await pipelineRepo.update(
            createPipelineWriteGuard(pipeline),
            { publishedVersionCount: newVersion },
        );
        if (allocation.affected !== 1) {
            throw new Error(
                `Pipeline "${pipeline.code}" was published concurrently; reload before publishing again`,
            );
        }
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

        const publishedAt = new Date();
        const publicationCriteria = createPipelineWriteGuard(pipeline, {
            publishedVersionCount: newVersion,
            rowVersion: pipeline.rowVersion + 1,
        });
        // Casting the final values avoids TypeORM recursively expanding PipelineDefinition.
        const publication = await pipelineRepo.update(
            publicationCriteria,
            {
                definition,
                version: newVersion,
                currentRevisionId: saved.id,
                draftRevisionId: null,
                status: PipelineStatus.PUBLISHED,
                publishedAt,
                publishedByUserId: revision.authorUserId,
            } as never,
        );
        if (publication.affected !== 1) {
            throw new Error(
                `Pipeline "${pipeline.code}" changed concurrently; reload before publishing`,
            );
        }
        pipeline.version = newVersion;
        pipeline.publishedVersionCount = newVersion;
        pipeline.currentRevisionId = saved.id;
        pipeline.draftRevisionId = null;
        pipeline.definition = definition;
        pipeline.status = PipelineStatus.PUBLISHED;
        pipeline.publishedAt = publishedAt;
        pipeline.publishedByUserId = revision.authorUserId;
        advancePipelineRowVersion(pipeline, 2);

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

    private async assertPublicationDefinition(
        ctx: RequestContext,
        pipeline: Pipeline,
        definition: PipelineDefinition,
    ): Promise<void> {
        const validation = await this.definitionValidator.validateAsync(
            definition,
            {
                level: ValidationLevel.FULL,
                requireAdapterBindings: true,
            },
            ctx,
        );
        const dependencyCheckFailures = validation.warnings.filter(
            warning => warning.errorCode === 'depends-on-check-failed'
                || warning.errorCode === 'resource-reference-check-failed'
                || warning.errorCode === 'hook-reference-check-failed',
        );
        const publicationIssues = [...validation.issues, ...dependencyCheckFailures];
        if (publicationIssues.length > 0) {
            throw new PipelineDefinitionError(publicationIssues);
        }

        const candidates = await loadActivePipelineDefinitions(this.connection, ctx);
        const cycle = findReachableDependencyCycle(
            pipeline.code,
            definition,
            candidates,
        );
        if (cycle) {
            throw new Error(`Pipeline dependency cycle detected: ${cycle.join(' -> ')}`);
        }
    }

    async getTimeline(
        ctx: RequestContext,
        pipelineId: ID,
        limit: number = PAGINATION.EVENTS_LIMIT,
    ): Promise<TimelineEntry[]> {
        if (!Number.isInteger(limit) || limit < 1 || limit > PAGINATION.MAX_QUERY_LIMIT) {
            throw new UserInputError(`limit must be an integer between 1 and ${PAGINATION.MAX_QUERY_LIMIT}`);
        }
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

        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { id: pipelineId },
            select: ['id', 'draftRevisionId', 'currentRevisionId'],
        });
        const runStats = await this.getRevisionRunStats(ctx, pipelineId, revisions);

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
                    isLatest: revision.id === pipeline?.draftRevisionId || revision.id === pipeline?.currentRevisionId,
                    isCurrent: revision.id === pipeline?.currentRevisionId,
                },
                runCount: stats?.runCount ?? 0,
                lastRunAt: lastRun?.finishedAt || lastRun?.startedAt || null,
                lastRunStatus: this.getRunOutcome(lastRun ?? null),
            };
        });
    }

    private getRunOutcome(
        run: RevisionRunStats['lastRun'],
    ): RunOutcome | null {
        if (!run) return null;
        if (run.status === RunStatus.FAILED || run.status === RunStatus.TIMEOUT) {
            return RunOutcome.FAILED;
        }
        if (run.status !== RunStatus.COMPLETED) {
            return null;
        }
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
            .andWhere('run.revisionId IN (:...revisionIds)', { revisionIds })
            .andWhere(query => {
                const newerRun = query.subQuery()
                    .select('1')
                    .from(PipelineRun, 'newer')
                    .where('newer.pipelineId = run.pipelineId')
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
}
