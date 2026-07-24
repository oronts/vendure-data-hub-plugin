import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import {
    DeletionResponse,
    DeletionResult,
} from '@vendure/common/lib/generated-types';
import {
    assertFound,
    EventBus,
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    CLEARED_PIPELINE_RUN_GATE_STATE,
    clearPipelineRunGateState,
    Pipeline,
    PipelineRevision,
    PipelineRun,
} from '../../entities/pipeline';
import {
    DryRunMessage,
    JsonObject,
    PipelineDefinition,
    PipelineMetrics,
    RunStatus,
} from '../../types/index';
import {
    ConfigurationSource,
    PipelineStatus,
    RevisionType,
    SortOrder,
    StepType,
} from '../../constants/enums';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { createSeededGraphInput, type SeededInputMode } from '../../runtime/orchestration';
import {
    getGateCheckpointKeys,
    type GateCheckpointKeys,
} from '../../runtime/gate-checkpoint';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS, SCHEDULER } from '../../constants/index';
import { PipelineQueueRequestEvent } from '../events/pipeline-events';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import { CheckpointService } from '../data/checkpoint.service';
import { DomainEventsService } from '../events/domain-events.service';
import { RevisionService } from '../versioning/revision.service';
import {
    PublishDataHubPipelinePermission,
    ReviewDataHubPipelinePermission,
} from '../../permissions';
import {
    assertPipelineRunnable,
    clonePipelineDefinition,
    assertPipelineStatus,
    assertValidPipelineCode,
    definitionsEqual,
    normalizePipelineDefinition,
    normalizePipelineVersion,
    PipelineRevisionMismatchError,
    PublishedPipelineRevisionUnavailableError,
    statusAfterExecutableUpdate,
} from './pipeline-policy';
import {
    advancePipelineRowVersion,
    createPipelineWriteGuard,
} from './pipeline-write-guard';
import { PipelineExecutionPermissionService } from './pipeline-execution-permission.service';
import { sanitizePipelineDefinitionForOutput } from '../validation/hook-security';
import {
    createPipelineRunIdempotencyScope,
    PipelineRunIdempotencyConflictError,
    type PipelineRunIdempotencyScope,
} from './pipeline-run-idempotency';
import {
    getActivePipelineRunChannelId,
    getPipelineRunChannel,
} from './pipeline-run-channel';
import { buildDryRunMessages } from './dry-run-messages';
import {
    loadActivePipelineDefinitions,
    loadActivePipelineDefinitionsAcrossChannels,
} from './active-pipeline-definitions';
import { getPipelineDependencies } from './pipeline-dependency-graph';
import { assertDatabaseConfiguration } from '../config/configuration-ownership';
import { ManagedResourceChannelService } from '../config/managed-resource-channel.service';

export interface CreatePipelineInput {
    code: string;
    name: string;
    enabled?: boolean;
    version?: number;
    definition: PipelineDefinition;
}

export interface UpdatePipelineInput {
    id: ID;
    code?: string;
    name?: string;
    enabled?: boolean;
    version?: number;
    definition?: PipelineDefinition;
}

interface PipelineUpdatePatch {
    code?: string;
    name?: string;
    enabled?: boolean;
    version?: number;
    definition?: PipelineDefinition;
    status?: PipelineStatus;
    draftRevisionId?: ID | null;
    configurationSource?: ConfigurationSource;
}

interface PipelineWriteOptions {
    readonly configurationSource?: ConfigurationSource;
    readonly allowCodeFirstManaged?: boolean;
}

export interface SeededRunOptions {
    triggerKey: string;
    skipPermissionCheck?: boolean;
    triggeredBy?: string;
    seedMode?: SeededInputMode;
    deferQueueEnqueue?: boolean;
    expectedRevisionId?: ID;
}

export interface IdempotentSeededRunOptions extends SeededRunOptions {
    idempotencyKey: string;
    idempotencyTtlSeconds: number;
    requestFingerprint: string;
}

export interface IdempotentSeededRunResult {
    run: PipelineRun;
    duplicate: boolean;
}

interface PreparedPipelineRun {
    readonly pipeline: Pipeline;
    readonly revisionId: ID;
    readonly definition: PipelineDefinition;
}

function toPublicPipeline(pipeline: Pipeline): Pipeline {
    const sanitized = Object.assign(new Pipeline(), pipeline);
    sanitized.definition = sanitizePipelineDefinitionForOutput(pipeline.definition);
    return sanitized;
}

function toPublicRevision(revision: PipelineRevision): PipelineRevision {
    const sanitized = Object.assign(new PipelineRevision(), revision);
    sanitized.definition = sanitizePipelineDefinitionForOutput(revision.definition);
    return sanitized;
}

@Injectable()
export class PipelineService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private eventBus: EventBus,
        private definitionValidator: DefinitionValidationService,
        private adapterRuntime: AdapterRuntimeService,
        private executionPermissions: PipelineExecutionPermissionService,
        private checkpointService: CheckpointService,
        private domainEvents: DomainEventsService,
        private revisionService: RevisionService,
        private managedResourceChannels: ManagedResourceChannelService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    async findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<Pipeline>,
    ): Promise<PaginatedList<Pipeline>> {
        const qb = this.listQueryBuilder.build(Pipeline, options, {
            ctx,
            channelId: ctx.channelId,
        });
        const [items, totalItems] = await qb.getManyAndCount();
        return { items: items.map(toPublicPipeline), totalItems };
    }

    async findOne(ctx: RequestContext, id: ID): Promise<Pipeline | null> {
        const pipeline = await this.connection.findOneInChannel(
            ctx,
            Pipeline,
            id,
            ctx.channelId,
            { relations: ['channels'] },
        );
        return pipeline ? toPublicPipeline(pipeline) : null;
    }

    async findByCodes(ctx: RequestContext, codes: string[]): Promise<Pipeline[]> {
        if (!codes?.length) return [];
        const pipelines = await this.connection.getRepository(ctx, Pipeline)
            .createQueryBuilder('pipeline')
            .innerJoin('pipeline.channels', 'channel', 'channel.id = :channelId', {
                channelId: ctx.channelId,
            })
            .where('pipeline.code IN (:...codes)', { codes })
            .getMany();
        return pipelines.map(toPublicPipeline);
    }

    async findDependents(ctx: RequestContext, code: string): Promise<Pipeline[]> {
        return this.findDependentsWithScope(ctx, code, false);
    }

    private async findDependentsWithScope(
        ctx: RequestContext,
        code: string,
        acrossChannels: boolean,
    ): Promise<Pipeline[]> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const candidates = await repo.find({
            where: acrossChannels ? {} : { channels: { id: ctx.channelId } },
            take: SCHEDULER.MAX_PIPELINE_DISCOVERY + 1,
        });
        if (candidates.length > SCHEDULER.MAX_PIPELINE_DISCOVERY) {
            throw new Error(
                `Pipeline dependency discovery exceeded the safe limit of ${SCHEDULER.MAX_PIPELINE_DISCOVERY}`,
            );
        }
        const activeDefinitions = acrossChannels
            ? await loadActivePipelineDefinitionsAcrossChannels(this.connection, ctx)
            : await loadActivePipelineDefinitions(this.connection, ctx);
        const activeById = new Map(
            activeDefinitions.map(pipeline => [String(pipeline.id), pipeline.definition]),
        );
        return candidates
            .filter(pipeline => (
                getPipelineDependencies(pipeline.definition).includes(code)
                || getPipelineDependencies(activeById.get(String(pipeline.id))).includes(code)
            ))
            .map(toPublicPipeline);
    }

    async findByCode(ctx: RequestContext, code: string): Promise<Pipeline | null> {
        return this.connection.getRepository(ctx, Pipeline).findOne({
            where: { code, channels: { id: ctx.channelId } },
        });
    }

    async claimCodeFirstOwnership(ctx: RequestContext, pipeline: Pipeline): Promise<void> {
        if (pipeline.configurationSource === ConfigurationSource.CODE_FIRST) {
            return;
        }
        const update = await this.connection.getRepository(ctx, Pipeline).update(
            createPipelineWriteGuard(pipeline),
            { configurationSource: ConfigurationSource.CODE_FIRST },
        );
        if (update.affected !== 1) {
            throw new Error(
                `Pipeline "${pipeline.code}" changed concurrently while claiming code-first ownership`,
            );
        }
    }

    async refreshCodeFirstPublishedDefinition(
        ctx: RequestContext,
        pipelineId: ID,
        definition: PipelineDefinition,
    ): Promise<Pipeline> {
        const revision = await this.revisionService
            .refreshCodeFirstPublishedDefinition(ctx, pipelineId, definition);
        return assertFound(this.findOne(ctx, revision.pipelineId));
    }

    async releaseCodeFirstOwnership(
        ctx: RequestContext,
        activeCodes: ReadonlySet<string>,
    ): Promise<number> {
        const repository = this.connection.getRepository(ctx, Pipeline);
        const managedPipelines = await repository.find({
            where: {
                configurationSource: ConfigurationSource.CODE_FIRST,
                channels: { id: ctx.channelId },
            },
        });
        const stalePipelines = managedPipelines.filter(
            pipeline => !activeCodes.has(pipeline.code),
        );
        for (const pipeline of stalePipelines) {
            const update = await repository.update(
                createPipelineWriteGuard(pipeline),
                { configurationSource: ConfigurationSource.DATABASE },
            );
            if (update.affected !== 1) {
                throw new Error(
                    `Pipeline "${pipeline.code}" changed concurrently while releasing code-first ownership`,
                );
            }
        }
        return stalePipelines.length;
    }

    async create(
        ctx: RequestContext,
        input: CreatePipelineInput,
        options: PipelineWriteOptions = {},
    ): Promise<Pipeline> {
        this.logger.debug('Creating pipeline', { pipelineCode: input.code });
        assertValidPipelineCode(input.code);
        // Quick-fail optimization: check code availability before save.
        // The DB unique constraint on Pipeline.code is the true guard against race conditions.
        await this.assertCodeAvailable(ctx, input.code);
        const definition = normalizePipelineDefinition(input.definition, 1);
        this.definitionValidator.validate(definition);
        const entity = new Pipeline();
        entity.code = input.code;
        entity.name = input.name;
        entity.enabled = input.enabled ?? true;
        entity.configurationSource = options.configurationSource
            ?? ConfigurationSource.DATABASE;
        entity.version = normalizePipelineVersion(input.version, definition.version);
        entity.definition = definition;
        await this.managedResourceChannels.assignToCurrentChannel(ctx, entity);
        let saved: Pipeline;
        try {
            saved = await this.connection.getRepository(ctx, Pipeline).save(entity);
        } catch (error: unknown) {
            // Handle unique constraint violation from concurrent inserts (TOCTOU race)
            const msg = getErrorMessage(error);
            if (isDuplicateEntryError(msg)) {
                throw new Error(`Pipeline code "${input.code}" already exists`);
            }
            throw error;
        }
        this.logger.info('Pipeline created', {
            pipelineCode: input.code,
            pipelineId: saved.id,
        });
        this.domainEvents.publishPipelineCreated(saved.id.toString(), input.code);
        return assertFound(this.findOne(ctx, saved.id));
    }

    async update(
        ctx: RequestContext,
        input: UpdatePipelineInput,
        options: PipelineWriteOptions = {},
    ): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const entity = await this.getPipelineInActiveChannel(ctx, input.id);
        const writeGuard = createPipelineWriteGuard(entity);
        if (!options.allowCodeFirstManaged) {
            assertDatabaseConfiguration(
                entity.configurationSource,
                'Pipeline',
                entity.code,
                'updated',
            );
        }
        if (entity.status === PipelineStatus.ARCHIVED) {
            throw new Error('Cannot update an archived pipeline; reactivate it first');
        }
        const patch: PipelineUpdatePatch = {};
        let executableChanged = false;

        if (input.code && input.code !== entity.code) {
            if (entity.currentRevisionId != null) {
                throw new Error('Cannot rename a pipeline after its first publication');
            }
            assertValidPipelineCode(input.code);
            await this.assertCodeAvailable(ctx, input.code, entity.id);
            await this.assertNoDependents(ctx, entity.code, 'rename');
            entity.code = input.code;
            patch.code = input.code;
            executableChanged = true;
        }
        if (typeof input.name === 'string' && input.name !== entity.name) {
            entity.name = input.name;
            patch.name = input.name;
        }
        if (typeof input.enabled === 'boolean' && input.enabled !== entity.enabled) {
            entity.enabled = input.enabled;
            patch.enabled = input.enabled;
        }
        if (input.version !== undefined) {
            const version = normalizePipelineVersion(input.version, entity.version);
            if (version !== entity.version) {
                executableChanged = true;
                entity.version = version;
                patch.version = version;
            }
        }
        if (input.definition) {
            const definition = normalizePipelineDefinition(input.definition, entity.version);
            this.definitionValidator.validate(definition);
            if (!definitionsEqual(entity.definition, definition)) {
                entity.definition = definition;
                patch.definition = definition;
                executableChanged = true;
            }
        }
        const nextStatus = statusAfterExecutableUpdate(entity.status, executableChanged);
        if (nextStatus !== entity.status) {
            entity.status = nextStatus;
            patch.status = nextStatus;
        }
        if (executableChanged) {
            entity.draftRevisionId = null;
            patch.draftRevisionId = null;
        }
        if (
            options.configurationSource !== undefined
            && options.configurationSource !== entity.configurationSource
        ) {
            entity.configurationSource = options.configurationSource;
            patch.configurationSource = options.configurationSource;
        }

        if (Object.keys(patch).length === 0) {
            return assertFound(this.findOne(ctx, entity.id));
        }

        // Casting the narrow patch avoids TypeORM recursively expanding PipelineDefinition.
        const update = await repo.update(writeGuard, patch as never);
        if (update.affected !== 1) {
            throw new Error(
                `Pipeline "${entity.code}" changed concurrently; reload before updating`,
            );
        }
        advancePipelineRowVersion(entity);
        this.domainEvents.publishPipelineUpdated(entity.id.toString(), entity.code);
        return assertFound(this.findOne(ctx, entity.id));
    }

    async delete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const plan = await this.managedResourceChannels.prepareDelete(ctx, Pipeline, id);
        const entity = plan.entity;
        // Capture id and code before remove(). TypeORM clears entity.id after deletion
        const deletedId = entity.id.toString();
        const deletedCode = entity.code;
        try {
            if (plan.physicallyDelete) {
                assertDatabaseConfiguration(
                    entity.configurationSource,
                    'Pipeline',
                    entity.code,
                    'deleted',
                );
            }
            const dependents = await this.findDependentsWithScope(
                ctx,
                deletedCode,
                plan.physicallyDelete,
            );
            if (dependents.length > 0) {
                return {
                    result: DeletionResult.NOT_DELETED,
                    message: this.dependentPipelineMessage(deletedCode, dependents, 'delete'),
                };
            }
            await this.assertNoNonterminalRuns(ctx, id, plan.physicallyDelete);
            if (plan.physicallyDelete) {
                await repo.remove(entity);
            } else {
                await this.managedResourceChannels.removeFromActiveChannel(
                    ctx,
                    Pipeline,
                    id,
                );
            }
            this.domainEvents.publishPipelineDeleted(deletedId, deletedCode);
            return { result: DeletionResult.DELETED };
        } catch (e) {
            return { result: DeletionResult.NOT_DELETED, message: getErrorMessage(e) };
        }
    }

    async publish(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const pipeline = await this.getPipelineInActiveChannel(ctx, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.REVIEW], 'publish');
        const revision = await this.revisionService.publishVersion(ctx, {
            pipelineId: id,
            authorUserId: ctx.activeUserId?.toString(),
        });
        return assertFound(this.findOne(ctx, revision.pipelineId));
    }

    private async assertNoDependents(
        ctx: RequestContext,
        pipelineCode: string,
        action: 'delete' | 'rename',
    ): Promise<void> {
        const dependents = await this.findDependentsWithScope(ctx, pipelineCode, true);
        if (dependents.length === 0) return;
        throw new Error(this.dependentPipelineMessage(pipelineCode, dependents, action));
    }

    private dependentPipelineMessage(
        pipelineCode: string,
        dependents: readonly Pipeline[],
        action: 'delete' | 'rename',
    ): string {
        const dependentCodes = dependents
            .map(pipeline => pipeline.code)
            .sort((left, right) => left.localeCompare(right));
        return `Cannot ${action} pipeline "${pipelineCode}" because it is required by: ${dependentCodes.join(', ')}`;
    }

    private async assertNoNonterminalRuns(
        ctx: RequestContext,
        pipelineId: ID,
        acrossChannels: boolean,
    ): Promise<void> {
        const count = await this.connection.getRepository(ctx, PipelineRun).count({
            where: {
                pipelineId,
                status: In([
                    RunStatus.PENDING,
                    RunStatus.RUNNING,
                    RunStatus.PAUSED,
                    RunStatus.CANCEL_REQUESTED,
                ]),
                ...(acrossChannels ? {} : { channelId: String(ctx.channelId) }),
            },
        });
        if (count > 0) {
            throw new Error(
                `Pipeline has ${count} nonterminal run${count === 1 ? '' : 's'}`,
            );
        }
    }

    async approve(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const pipeline = await this.getPipelineInActiveChannel(ctx, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.REVIEW], 'approve');
        const canReview = ctx.userHasPermissions([
            ReviewDataHubPipelinePermission.Permission,
        ]);
        const canPublish = ctx.userHasPermissions([
            PublishDataHubPipelinePermission.Permission,
        ]);
        if (!canReview || !canPublish) {
            throw new Error('Approving a pipeline requires both review and publish permissions');
        }
        return this.publish(ctx, id);
    }

    async submitForReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.getPipelineInActiveChannel(ctx, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.DRAFT], 'submit for review');
        this.definitionValidator.validate(pipeline.definition);
        const update = await repo.update(
            createPipelineWriteGuard(pipeline),
            { status: PipelineStatus.REVIEW },
        );
        if (update.affected !== 1) {
            throw new Error('Pipeline changed concurrently; reload before submitting for review');
        }
        pipeline.status = PipelineStatus.REVIEW;
        advancePipelineRowVersion(pipeline);
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async rejectReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.getPipelineInActiveChannel(ctx, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.REVIEW], 'reject review for');
        const update = await repo.update(
            createPipelineWriteGuard(pipeline),
            { status: PipelineStatus.DRAFT },
        );
        if (update.affected !== 1) {
            throw new Error('Pipeline changed concurrently; reload before rejecting review');
        }
        pipeline.status = PipelineStatus.DRAFT;
        advancePipelineRowVersion(pipeline);
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async archive(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.getPipelineInActiveChannel(ctx, id);
        assertDatabaseConfiguration(
            pipeline.configurationSource,
            'Pipeline',
            pipeline.code,
            'archived',
        );
        assertPipelineStatus(pipeline.status, [PipelineStatus.PUBLISHED], 'archive');
        const update = await repo.update(
            createPipelineWriteGuard(pipeline),
            { status: PipelineStatus.ARCHIVED, enabled: false },
        );
        if (update.affected !== 1) {
            throw new Error('Pipeline changed concurrently; reload before archiving');
        }
        pipeline.status = PipelineStatus.ARCHIVED;
        pipeline.enabled = false;
        advancePipelineRowVersion(pipeline);
        this.domainEvents.publishPipelineArchived(pipeline.id.toString(), pipeline.code);
        return assertFound(this.findOne(ctx, pipeline.id));
    }
    async reactivate(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.getPipelineInActiveChannel(ctx, id);
        assertDatabaseConfiguration(
            pipeline.configurationSource,
            'Pipeline',
            pipeline.code,
            'reactivated',
        );
        assertPipelineStatus(pipeline.status, [PipelineStatus.ARCHIVED], 'reactivate');
        const definition = await this.getPublishedDefinition(ctx, pipeline);
        const update = await repo.update(
            createPipelineWriteGuard(pipeline),
            {
                definition: definition as never,
                status: PipelineStatus.PUBLISHED,
                enabled: true,
            },
        );
        if (update.affected !== 1) {
            throw new Error('Pipeline changed concurrently; reload before reactivating');
        }
        pipeline.definition = definition;
        pipeline.status = PipelineStatus.PUBLISHED;
        pipeline.enabled = true;
        advancePipelineRowVersion(pipeline);
        this.domainEvents.publishPipelineReactivated(pipeline.id.toString(), pipeline.code);
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async listRevisions(ctx: RequestContext, pipelineId: ID): Promise<PipelineRevision[]> {
        await this.getPipelineInActiveChannel(ctx, pipelineId);
        const repo = this.connection.getRepository(ctx, PipelineRevision);
        const revisions = await repo.find({
            where: { pipelineId },
            order: { createdAt: SortOrder.DESC },
        });
        return revisions.map(toPublicRevision);
    }

    async revertToRevision(ctx: RequestContext, revisionId: ID): Promise<Pipeline> {
        const revision = await this.connection.getEntityOrThrow(
            ctx,
            PipelineRevision,
            revisionId,
        );
        const pipeline = await this.connection.getEntityOrThrow(
            ctx,
            Pipeline,
            revision.pipelineId,
            { channelId: ctx.channelId },
        );
        assertDatabaseConfiguration(
            pipeline.configurationSource,
            'Pipeline',
            pipeline.code,
            'reverted',
        );
        const revertedRevision = await this.revisionService.revertToRevision(ctx, {
            revisionId,
            authorUserId: ctx.activeUserId?.toString(),
        });
        return assertFound(this.findOne(ctx, revertedRevision.pipelineId));
    }

    async listRuns(
        ctx: RequestContext,
        options?: ListQueryOptions<PipelineRun>,
        pipelineId?: ID,
    ): Promise<PaginatedList<PipelineRun>> {
        const channelId = getActivePipelineRunChannelId(ctx);
        const qb = this.listQueryBuilder.build(PipelineRun, options, { ctx });
        // Always join the pipeline relation. Required because the GraphQL schema
        // exposes pipeline as a non-nullable field on PipelineRun.
        qb.leftJoinAndSelect(`${qb.alias}.pipeline`, 'pipeline');
        qb.andWhere(`${qb.alias}.channelId = :channelId`, { channelId });
        if (pipelineId) {
            qb.andWhere(`${qb.alias}.pipelineId = :pid`, { pid: pipelineId });
        }
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    runById(ctx: RequestContext, id: ID): Promise<PipelineRun | null> {
        const channelId = getActivePipelineRunChannelId(ctx);
        return this.connection.getRepository(ctx, PipelineRun).findOne({
            where: { id, channelId },
            relations: { pipeline: true },
        });
    }

    async startRun(
        ctx: RequestContext,
        pipelineId: ID,
        options?: {
            skipPermissionCheck?: boolean;
            triggeredBy?: string;
            expectedRevisionId?: ID;
        },
    ): Promise<PipelineRun> {
        const runChannel = getPipelineRunChannel(ctx);
        const { pipeline, revisionId, definition } = await this.preparePipelineRun(
            ctx,
            pipelineId,
            options?.skipPermissionCheck,
            options?.expectedRevisionId,
        );
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const runEntity = new PipelineRun();
        runEntity.pipeline = pipeline;
        runEntity.revisionId = revisionId;
        runEntity.status = RunStatus.PENDING;
        runEntity.startedAt = null;
        runEntity.finishedAt = null;
        runEntity.metrics = null;
        runEntity.error = null;
        runEntity.definitionSnapshot = definition;
        runEntity.checkpoint = null;
        runEntity.startedByUserId = ctx.activeUserId?.toString() ?? null;
        runEntity.triggeredBy = options?.triggeredBy ?? (ctx.activeUserId ? `manual:${ctx.activeUserId}` : 'manual');
        runEntity.channelId = runChannel.channelId;
        runEntity.channelToken = runChannel.channelToken;
        runEntity.queueRequestedAt = new Date();
        runEntity.queueDispatchedAt = null;
        clearPipelineRunGateState(runEntity);
        const run = await repo.save(runEntity);
        this.eventBus.publish(new PipelineQueueRequestEvent(
            ctx,
            run.id,
            pipelineId,
            runEntity.triggeredBy,
        ));
        this.logger.info('Pipeline run started', {
            pipelineId,
            pipelineCode: pipeline.code,
            runId: run.id,
            userId: ctx.activeUserId,
        });
        return assertFound(this.runById(ctx, run.id));
    }

    async cancelRun(ctx: RequestContext, id: ID): Promise<PipelineRun> {
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const run = await assertFound(this.runById(ctx, id));
        if (run.status === RunStatus.RUNNING) {
            run.status = RunStatus.CANCEL_REQUESTED;
            await repo.save(run, { reload: false });
        } else if (run.status === RunStatus.PAUSED) {
            // PAUSED runs have no active runner to detect CANCEL_REQUESTED, so cancel immediately
            run.status = RunStatus.CANCELLED;
            run.finishedAt = new Date();
            run.error = 'Cancelled by user while paused at gate';
            clearPipelineRunGateState(run);
            await repo.save(run, { reload: false });

            // Emit cancellation event for subscribers (webhooks, audit logs, monitoring)
            this.domainEvents.publishRunCancelled(
                run.pipelineId?.toString(),
                String(id),
                ctx.activeUserId?.toString(),
            );

            this.logger.info('Pipeline run cancellation requested', { runId: id });
        } else if (run.status === RunStatus.PENDING) {
            run.status = RunStatus.CANCELLED;
            run.finishedAt = new Date();
            run.queueRequestedAt = null;
            run.queueDispatchedAt = null;
            clearPipelineRunGateState(run);
            await repo.save(run, { reload: false });
            this.domainEvents.publishRunCancelled(
                run.pipelineId?.toString(),
                String(id),
                ctx.activeUserId?.toString(),
            );
            this.logger.info('Pipeline run cancelled', { runId: id });
        }
        return assertFound(this.runById(ctx, run.id));
    }

    async startRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: SeededRunOptions,
    ): Promise<PipelineRun> {
        return this.createSeededRun(ctx, pipelineId, seed, options);
    }

    async startIdempotentRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
    ): Promise<IdempotentSeededRunResult> {
        return this.startPreparedIdempotentRun(
            ctx,
            pipelineId,
            seed,
            options,
            () => this.preparePipelineRun(
                ctx,
                pipelineId,
                options.skipPermissionCheck,
                options.expectedRevisionId,
            ),
        );
    }

    async startPinnedIdempotentRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        revisionId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
    ): Promise<IdempotentSeededRunResult> {
        return this.startPreparedIdempotentRun(
            ctx,
            pipelineId,
            seed,
            options,
            () => this.preparePipelineRun(
                ctx,
                pipelineId,
                options.skipPermissionCheck,
                undefined,
                revisionId,
            ),
        );
    }

    private async startPreparedIdempotentRun(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
        prepare: () => Promise<PreparedPipelineRun>,
    ): Promise<IdempotentSeededRunResult> {
        const scope = createPipelineRunIdempotencyScope(
            ctx.channelId,
            options.triggerKey,
            options.idempotencyKey,
            options.requestFingerprint,
            options.idempotencyTtlSeconds,
        );
        const existing = await this.findIdempotentRun(ctx, pipelineId, scope);
        if (existing && !this.isIdempotencyExpired(existing)) {
            return this.toDuplicateIdempotentResult(existing, scope);
        }
        const prepared = await prepare();
        if (existing) {
            await this.releaseIdempotencyScope(ctx, existing);
        }

        try {
            const run = await this.createSeededRun(
                ctx,
                pipelineId,
                seed,
                options,
                scope,
                prepared,
            );
            return { run, duplicate: false };
        } catch (error) {
            if (!isDuplicateEntryError(getErrorMessage(error))) {
                throw error;
            }
            const winner = await this.findIdempotentRun(ctx, pipelineId, scope);
            if (!winner) {
                throw error;
            }
            return this.toDuplicateIdempotentResult(winner, scope);
        }
    }

    private async findIdempotentRun(
        ctx: RequestContext,
        pipelineId: ID,
        scope: PipelineRunIdempotencyScope,
    ): Promise<PipelineRun | null> {
        return this.connection.getRepository(ctx, PipelineRun).findOne({
            where: {
                pipelineId,
                channelId: scope.channelId,
                idempotencyChannelId: scope.channelId,
                idempotencyTriggerKeyHash: scope.triggerKeyHash,
                idempotencyKeyHash: scope.keyHash,
            },
            relations: { pipeline: true },
        });
    }

    private isIdempotencyExpired(run: PipelineRun): boolean {
        return run.idempotencyExpiresAt !== null &&
            run.idempotencyExpiresAt.getTime() <= Date.now();
    }

    private toDuplicateIdempotentResult(
        run: PipelineRun,
        scope: PipelineRunIdempotencyScope,
    ): IdempotentSeededRunResult {
        if (run.idempotencyPayloadHash !== scope.payloadHash) {
            throw new PipelineRunIdempotencyConflictError();
        }
        return { run, duplicate: true };
    }

    private async releaseIdempotencyScope(
        ctx: RequestContext,
        run: PipelineRun,
    ): Promise<void> {
        run.idempotencyChannelId = null;
        run.idempotencyTriggerKeyHash = null;
        run.idempotencyKeyHash = null;
        run.idempotencyPayloadHash = null;
        run.idempotencyExpiresAt = null;
        await this.connection.getRepository(ctx, PipelineRun).save(run, { reload: false });
    }

    private async createSeededRun(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: SeededRunOptions,
        idempotency?: PipelineRunIdempotencyScope,
        prepared?: PreparedPipelineRun,
    ): Promise<PipelineRun> {
        const runChannel = getPipelineRunChannel(ctx);
        const seededInput = createSeededGraphInput(options.triggerKey, seed, options.seedMode);
        const seedCheckpoint: JsonObject = {
            __seed: {
                triggerKey: seededInput.triggerKey,
                records: seededInput.records,
                mode: seededInput.mode,
            },
        };
        const { pipeline, revisionId, definition } = prepared ?? await this.preparePipelineRun(
            ctx,
            pipelineId,
            options.skipPermissionCheck,
            options.expectedRevisionId,
        );
        this.assertSeedTriggerRunnable(definition, options.triggerKey);
        const runEntity = new PipelineRun();
        runEntity.pipeline = pipeline;
        runEntity.revisionId = revisionId;
        runEntity.status = RunStatus.PENDING;
        runEntity.startedAt = null;
        runEntity.finishedAt = null;
        runEntity.metrics = null;
        runEntity.error = null;
        runEntity.definitionSnapshot = definition;
        runEntity.checkpoint = seedCheckpoint;
        runEntity.startedByUserId = ctx.activeUserId?.toString() ?? null;
        runEntity.triggeredBy = options.triggeredBy ??
            (ctx.activeUserId ? `manual:${ctx.activeUserId}` : 'manual');
        runEntity.channelId = runChannel.channelId;
        runEntity.channelToken = runChannel.channelToken;
        runEntity.queueRequestedAt = new Date();
        runEntity.queueDispatchedAt = null;
        runEntity.idempotencyChannelId = idempotency?.channelId ?? null;
        runEntity.idempotencyTriggerKeyHash = idempotency?.triggerKeyHash ?? null;
        runEntity.idempotencyKeyHash = idempotency?.keyHash ?? null;
        runEntity.idempotencyPayloadHash = idempotency?.payloadHash ?? null;
        runEntity.idempotencyExpiresAt = idempotency?.expiresAt ?? null;
        clearPipelineRunGateState(runEntity);

        const run = await this.connection.getRepository(ctx, PipelineRun).save(runEntity);
        if (!options.deferQueueEnqueue) {
            this.eventBus.publish(new PipelineQueueRequestEvent(
                ctx,
                run.id,
                pipelineId,
                runEntity.triggeredBy,
                seedCheckpoint,
            ));
        }
        return assertFound(this.runById(ctx, run.id));
    }

    private assertSeedTriggerRunnable(
        definition: PipelineDefinition,
        triggerKey: string,
    ): void {
        const trigger = definition.steps.find(step => step.key === triggerKey);
        if (
            !trigger
            || trigger.type !== StepType.TRIGGER
            || trigger.disabled === true
        ) {
            throw new Error(
                `Published revision has no enabled trigger step "${triggerKey}"`,
            );
        }
        if (!(definition.edges ?? []).some(edge => edge.from === triggerKey)) {
            throw new Error(
                `Published revision trigger "${triggerKey}" has no outgoing route`,
            );
        }
    }

    private async preparePipelineRun(
        ctx: RequestContext,
        pipelineId: ID,
        skipPermissionCheck = false,
        expectedRevisionId?: ID,
        pinnedRevisionId?: ID,
    ): Promise<PreparedPipelineRun> {
        let pipeline: Pipeline;
        try {
            pipeline = await this.connection.getEntityOrThrow(
                ctx,
                Pipeline,
                pipelineId,
            );
        } catch (error) {
            if (pinnedRevisionId != null) {
                throw new PublishedPipelineRevisionUnavailableError(
                    `id:${String(pipelineId)}`,
                    pinnedRevisionId,
                );
            }
            throw error;
        }
        assertPipelineRunnable(pipeline);
        if (
            expectedRevisionId != null
            && String(pipeline.currentRevisionId) !== String(expectedRevisionId)
        ) {
            throw new PipelineRevisionMismatchError(
                expectedRevisionId,
                pipeline.currentRevisionId,
            );
        }
        const revisionId = pinnedRevisionId ?? pipeline.currentRevisionId!;
        const definition = await this.getPublishedDefinition(ctx, pipeline, revisionId);
        if (!skipPermissionCheck) {
            await this.assertCapabilitiesAllowed(ctx, definition);
        }
        return { pipeline, revisionId, definition };
    }

    async startRunByCode(
        ctx: RequestContext,
        code: string,
        opts?: {
            seedRecords?: unknown[];
            triggerKey?: string;
            seedMode?: SeededInputMode;
            skipPermissionCheck?: boolean;
            triggeredBy?: string;
            expectedRevisionId?: ID;
        },
    ): Promise<PipelineRun> {
        const pipeline = await this.findByCode(ctx, code);
        if (!pipeline) {
            throw new Error(`Pipeline with code "${code}" not found`);
        }
        if (opts?.seedRecords) {
            if (!opts.triggerKey) {
                throw new Error('Seeded pipeline execution requires a trigger key');
            }
            return this.startRunWithSeed(ctx, pipeline.id, opts.seedRecords, {
                triggerKey: opts.triggerKey,
                skipPermissionCheck: opts.skipPermissionCheck,
                triggeredBy: opts.triggeredBy,
                seedMode: opts.seedMode,
                expectedRevisionId: opts.expectedRevisionId,
            });
        }
        return this.startRun(ctx, pipeline.id, {
            skipPermissionCheck: opts?.skipPermissionCheck,
            triggeredBy: opts?.triggeredBy,
            expectedRevisionId: opts?.expectedRevisionId,
        });
    }

    /**
     * Approve a paused GATE step and resume the pipeline run.
     *
     * Uses atomic UPDATE WHERE to prevent TOCTOU race: only one concurrent caller
     * can flip PAUSED -> RUNNING. Subsequent callers see 0 affected rows and fail.
     */
    async approveGate(ctx: RequestContext, runId: ID, stepKey: string): Promise<PipelineRun> {
        const channelId = getActivePipelineRunChannelId(ctx);
        const gateState = await this.connection.withTransaction(
            ctx,
            async transactionCtx => {
                const repo = this.connection.getRepository(transactionCtx, PipelineRun);
                const state = await this.getPausedGateState(
                    transactionCtx,
                    runId,
                    stepKey,
                );
                const updateResult = await repo.update(
                    {
                        id: runId,
                        channelId,
                        status: RunStatus.PAUSED,
                        gateStepKey: stepKey,
                    },
                    {
                        status: RunStatus.RUNNING,
                        queueRequestedAt: new Date(),
                        queueDispatchedAt: null,
                        ...CLEARED_PIPELINE_RUN_GATE_STATE,
                    },
                );
                if (updateResult.affected === 0) {
                    const existing = await repo.findOne({
                        where: { id: runId, channelId },
                    });
                    if (!existing) throw new Error(`Pipeline run not found: ${runId}`);
                    throw new Error(`Cannot approve gate: run is not paused (current status: ${existing.status})`);
                }
                await this.checkpointService.updateForPipeline(
                    transactionCtx,
                    state.pipelineId,
                    current => {
                        if (!(state.keys.pending in current)) {
                            throw new Error(
                                `Cannot approve gate "${stepKey}": pending gate state was removed concurrently`,
                            );
                        }
                        return {
                            ...current,
                            [state.keys.approved]: true,
                        };
                    },
                );
                return state;
            },
        );

        this.domainEvents.publishGateApproved(
            gateState.pipelineId.toString(),
            String(runId),
            stepKey,
            ctx.activeUserId?.toString(),
        );

        this.logger.info('Gate approved, resuming pipeline run', {
            runId,
            stepKey,
            pipelineId: gateState.pipelineId,
            userId: ctx.activeUserId,
        });

        // Dispatch the run for continued execution via the job queue
        this.eventBus.publish(new PipelineQueueRequestEvent(
            ctx,
            runId,
            gateState.pipelineId,
            ctx.activeUserId ? `gate-approve:${ctx.activeUserId}` : 'gate-approve',
        ));

        return assertFound(this.runById(ctx, gateState.run.id));
    }

    /**
     * Reject a paused GATE step and cancel the pipeline run.
     *
     * Uses atomic UPDATE WHERE to prevent TOCTOU race: only one concurrent caller
     * can flip PAUSED -> CANCELLED. Subsequent callers see 0 affected rows and fail.
     */
    async rejectGate(ctx: RequestContext, runId: ID, stepKey: string): Promise<PipelineRun> {
        const channelId = getActivePipelineRunChannelId(ctx);
        const gateState = await this.connection.withTransaction(
            ctx,
            async transactionCtx => {
                const repo = this.connection.getRepository(transactionCtx, PipelineRun);
                const state = await this.getPausedGateState(
                    transactionCtx,
                    runId,
                    stepKey,
                );
                const updateResult = await repo.update(
                    {
                        id: runId,
                        channelId,
                        status: RunStatus.PAUSED,
                        gateStepKey: stepKey,
                    },
                    {
                        status: RunStatus.CANCELLED,
                        finishedAt: new Date(),
                        error: `Gate step "${stepKey}" rejected by user`,
                        ...CLEARED_PIPELINE_RUN_GATE_STATE,
                    },
                );
                if (updateResult.affected === 0) {
                    const existing = await repo.findOne({
                        where: { id: runId, channelId },
                    });
                    if (!existing) throw new Error(`Pipeline run not found: ${runId}`);
                    throw new Error(`Cannot reject gate: run is not paused (current status: ${existing.status})`);
                }

                await this.checkpointService.updateForPipeline(
                    transactionCtx,
                    state.pipelineId,
                    current => {
                        if (!(state.keys.pending in current)) {
                            throw new Error(
                                `Cannot reject gate "${stepKey}": pending gate state was removed concurrently`,
                            );
                        }
                        const next: JsonObject = { ...current };
                        delete next[state.keys.pending];
                        delete next[state.keys.approved];
                        return next;
                    },
                );
                return state;
            },
        );

        this.domainEvents.publishGateRejected(
            gateState.pipelineId.toString(),
            String(runId),
            stepKey,
            `Rejected by user ${ctx.activeUserId ?? 'unknown'}`,
        );
        this.logger.info('Gate rejected, cancelling pipeline run', {
            runId,
            stepKey,
            userId: ctx.activeUserId,
        });
        return assertFound(this.runById(ctx, gateState.run.id));
    }

    private async getPausedGateState(
        ctx: RequestContext,
        runId: ID,
        stepKey: string,
    ): Promise<{
        run: PipelineRun;
        pipelineId: ID;
        keys: GateCheckpointKeys;
    }> {
        const channelId = getActivePipelineRunChannelId(ctx);
        const run = await this.connection.getRepository(ctx, PipelineRun).findOne({
            where: { id: runId, channelId },
            relations: { pipeline: true },
        });
        if (!run) {
            throw new Error(`Pipeline run not found: ${runId}`);
        }
        if (run.status !== RunStatus.PAUSED) {
            throw new Error(
                `Cannot act on gate: run is not paused (current status: ${run.status})`,
            );
        }
        if (run.gateStepKey !== stepKey) {
            throw new Error(
                `Cannot act on gate "${stepKey}": run is paused at "${run.gateStepKey ?? 'unknown'}"`,
            );
        }
        const definition = run.definitionSnapshot;
        if (!definition) {
            throw new Error(
                `Cannot act on gate "${stepKey}": run has no immutable definition snapshot`,
            );
        }
        const step = definition?.steps.find(candidate => candidate.key === stepKey);
        if (step?.type !== StepType.GATE) {
            throw new Error(
                `Cannot act on gate "${stepKey}": run snapshot does not contain that gate`,
            );
        }
        const pipelineId = run.pipelineId ?? run.pipeline?.id;
        if (pipelineId == null) {
            throw new Error(`Pipeline run ${runId} has no pipeline`);
        }
        const checkpoint = await this.checkpointService.getByPipeline(
            ctx,
            pipelineId,
        );
        const checkpointData: JsonObject = { ...(checkpoint?.data ?? {}) };
        const keys = getGateCheckpointKeys(runId, stepKey);
        if (!(keys.pending in checkpointData)) {
            throw new Error(
                `Cannot act on gate "${stepKey}": pending gate state was not found for run ${runId}`,
            );
        }
        return {
            run,
            pipelineId,
            keys,
        };
    }

    private async getPublishedDefinition(
        ctx: RequestContext,
        pipeline: Pipeline,
        revisionId: ID = pipeline.currentRevisionId!,
    ): Promise<PipelineDefinition> {
        if (revisionId == null) {
            throw new PublishedPipelineRevisionUnavailableError(pipeline.code, null);
        }

        const revision = await this.connection.getRepository(ctx, PipelineRevision).findOne({
            where: {
                id: revisionId,
                pipelineId: pipeline.id,
                type: RevisionType.PUBLISHED,
            },
        });
        if (!revision) {
            throw new PublishedPipelineRevisionUnavailableError(
                pipeline.code,
                revisionId,
            );
        }
        return clonePipelineDefinition(revision.definition);
    }

    private async assertCodeAvailable(ctx: RequestContext, code: string, excludeId?: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const existing = await repo.findOne({ where: { code } });
        if (existing && (!excludeId || existing.id !== excludeId)) {
            throw new Error(`Pipeline code "${code}" already exists`);
        }
    }

    private getPipelineInActiveChannel(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<Pipeline> {
        return this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId, {
            channelId: ctx.channelId,
        });
    }

    async dryRun(ctx: RequestContext, pipelineId: ID): Promise<{
        metrics: PipelineMetrics;
        messages: DryRunMessage[];
        sampleRecords?: Array<{ step: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
    }> {
        const pipeline = await this.getPipelineInActiveChannel(ctx, pipelineId);
        this.definitionValidator.validate(pipeline.definition);
        await this.assertCapabilitiesAllowed(ctx, pipeline.definition);

        this.logger.debug('Starting dry run', {
            pipelineId,
            pipelineCode: pipeline.code,
            stepCount: pipeline.definition?.steps?.length ?? 0,
        });

        const result = await this.adapterRuntime.executeDryRun(ctx, pipeline.definition);
        const messages = buildDryRunMessages(
            pipeline.definition,
            result.metrics,
            result.errors,
        );

        this.logger.debug('Dry run completed', {
            pipelineCode: pipeline.code,
            totalRecords: result.metrics.totalRecords,
            sampleCount: result.sampleRecords?.length ?? 0,
        });

        return {
            metrics: result.metrics,
            messages,
            sampleRecords: result.sampleRecords,
        };
    }

    private async assertCapabilitiesAllowed(ctx: RequestContext, definition: PipelineDefinition): Promise<void> {
        await this.executionPermissions.assertAllowed(ctx, definition);
    }
}
