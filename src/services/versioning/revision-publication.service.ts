import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    PipelineDefinition,
    PublishVersionOptions,
    RevertOptions,
} from '../../types';
import {
    ConfigurationSource,
    PipelineStatus,
    RevisionType,
} from '../../constants/enums';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import { DiffService } from './diff.service';
import { DataHubLogger } from '../logger';
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
} from '../pipeline/pipeline-policy';
import { withEffectivePipelineCapabilities } from '../pipeline/pipeline-capabilities';
import { PipelineExecutionPermissionService } from '../pipeline/pipeline-execution-permission.service';
import { PipelineDefinitionError } from '../../validation/pipeline-definition-error';
import { findReachableDependencyCycle } from '../pipeline/pipeline-dependency-graph';
import { loadActivePipelineDefinitions } from '../pipeline/active-pipeline-definitions';
import {
    advancePipelineRowVersion,
    createPipelineWriteGuard,
} from '../pipeline/pipeline-write-guard';
import { assertDatabaseConfiguration } from '../config/configuration-ownership';
import { withResolvedAdapterBindings } from '../../sdk/adapter-bindings';
import { RevisionChannelAccessService } from './revision-channel-access.service';
import { RevisionDraftService } from './revision-draft.service';

const COMMIT_MESSAGE_MAX_LENGTH = 500;

interface PublicationMetadata {
    commitMessage?: string;
    authorUserId?: string;
    authorName?: string;
    skipPermissionCheck?: boolean;
}

export class RevisionPublicationService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly diffService: DiffService,
        private readonly definitionValidator: DefinitionValidationService,
        private readonly registry: DataHubRegistryService,
        private readonly executionPermissions: PipelineExecutionPermissionService,
        private readonly domainEvents: DomainEventsService,
        private readonly access: RevisionChannelAccessService,
        private readonly drafts: RevisionDraftService,
        private readonly logger: DataHubLogger,
    ) {}

    async publishVersion(
        ctx: RequestContext,
        options: PublishVersionOptions,
    ): Promise<PipelineRevision> {
        return this.connection.withTransaction(ctx, async transactionCtx => {
            const pipeline = await this.access.getPipeline(
                transactionCtx,
                options.pipelineId,
            );
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
            const pipeline = await this.access.getPipeline(
                transactionCtx,
                pipelineId,
            );
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
            const targetRevision = await this.access.getRevision(
                transactionCtx,
                options.revisionId,
            );
            if (!targetRevision) {
                throw new Error(`Revision ${options.revisionId} not found`);
            }
            if (!targetRevision.pipelineId) {
                throw new Error(`Revision ${options.revisionId} has no associated pipeline`);
            }

            const pipeline = await this.access.getPipeline(
                transactionCtx,
                targetRevision.pipelineId,
            );
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

            const commitMessage = options.commitMessage
                ?? `Reverted to version ${targetRevision.version || 'draft'} (revision #${options.revisionId})`;
            return this.commitPublishedRevision(
                transactionCtx,
                pipeline,
                targetRevision.definition,
                { ...options, commitMessage },
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
                normalizePipelineDefinition(
                    candidateDefinition,
                    candidateDefinition.version,
                ),
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
        revision.authorUserId = ctx.activeUserId?.toString()
            ?? metadata.authorUserId
            ?? null;
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

        if (this.drafts.shouldPruneOnPublish()) {
            await this.drafts.pruneDrafts(ctx, pipeline.id, true);
        }

        this.domainEvents.publishPipelinePublished(
            pipeline.id.toString(),
            pipeline.code,
            ctx,
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
        const publicationIssues = [
            ...validation.issues,
            ...dependencyCheckFailures,
        ];
        if (publicationIssues.length > 0) {
            throw new PipelineDefinitionError(publicationIssues);
        }

        const candidates = await loadActivePipelineDefinitions(
            this.connection,
            ctx,
        );
        const cycle = findReachableDependencyCycle(
            pipeline.code,
            definition,
            candidates,
        );
        if (cycle) {
            throw new Error(
                `Pipeline dependency cycle detected: ${cycle.join(' -> ')}`,
            );
        }
    }
}
