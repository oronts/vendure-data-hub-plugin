import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import {
    DeletionResponse,
    DeletionResult,
} from '@vendure/common/lib/generated-types';
import {
    assertFound,
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    Pipeline,
    PipelineRun,
} from '../../entities/pipeline';
import {
    PipelineDefinition,
    RunStatus,
} from '../../types';
import {
    ConfigurationSource,
    PipelineStatus,
} from '../../constants/enums';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import {
    DataHubLogger,
    DataHubLoggerFactory,
} from '../logger';
import { LOGGER_CONTEXTS } from '../../constants';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import { DomainEventsService } from '../events/domain-events.service';
import { RevisionService } from '../versioning/revision.service';
import {
    assertValidPipelineCode,
    definitionsEqual,
    normalizePipelineDefinition,
    normalizePipelineVersion,
    statusAfterExecutableUpdate,
} from './pipeline-policy';
import {
    advancePipelineRowVersion,
    createPipelineWriteGuard,
} from './pipeline-write-guard';
import { assertDatabaseConfiguration } from '../config/configuration-ownership';
import { ManagedResourceChannelService } from '../config/managed-resource-channel.service';
import { PipelineQueryService } from './pipeline-query.service';
import type {
    CreatePipelineInput,
    PipelineWriteOptions,
    UpdatePipelineInput,
} from './pipeline-management-types';

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

@Injectable()
export class PipelineMutationService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private definitionValidator: DefinitionValidationService,
        private domainEvents: DomainEventsService,
        private revisionService: RevisionService,
        private managedResourceChannels: ManagedResourceChannelService,
        private queries: PipelineQueryService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    async claimCodeFirstOwnership(
        ctx: RequestContext,
        pipeline: Pipeline,
    ): Promise<void> {
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
        return assertFound(this.queries.findOne(ctx, revision.pipelineId));
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
            const message = getErrorMessage(error);
            if (isDuplicateEntryError(message)) {
                throw new Error(`Pipeline code "${input.code}" already exists`);
            }
            throw error;
        }
        this.logger.info('Pipeline created', {
            pipelineCode: input.code,
            pipelineId: saved.id,
        });
        this.domainEvents.publishPipelineCreated(saved.id.toString(), input.code);
        return assertFound(this.queries.findOne(ctx, saved.id));
    }

    async update(
        ctx: RequestContext,
        input: UpdatePipelineInput,
        options: PipelineWriteOptions = {},
    ): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const entity = await this.queries.getInActiveChannel(ctx, input.id);
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
            return assertFound(this.queries.findOne(ctx, entity.id));
        }

        const update = await repo.update(writeGuard, patch as never);
        if (update.affected !== 1) {
            throw new Error(
                `Pipeline "${entity.code}" changed concurrently; reload before updating`,
            );
        }
        advancePipelineRowVersion(entity);
        this.domainEvents.publishPipelineUpdated(entity.id.toString(), entity.code);
        return assertFound(this.queries.findOne(ctx, entity.id));
    }

    async delete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const plan = await this.managedResourceChannels.prepareDelete(ctx, Pipeline, id);
        const entity = plan.entity;
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
            const dependents = await this.queries.findDependents(
                ctx,
                deletedCode,
                plan.physicallyDelete,
            );
            if (dependents.length > 0) {
                return {
                    result: DeletionResult.NOT_DELETED,
                    message: this.dependentPipelineMessage(
                        deletedCode,
                        dependents,
                        'delete',
                    ),
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
            this.domainEvents.publishPipelineDeleted(
                deletedId,
                deletedCode,
                String(ctx.channelId),
            );
            return { result: DeletionResult.DELETED };
        } catch (error) {
            return {
                result: DeletionResult.NOT_DELETED,
                message: getErrorMessage(error),
            };
        }
    }

    private async assertNoDependents(
        ctx: RequestContext,
        pipelineCode: string,
        action: 'delete' | 'rename',
    ): Promise<void> {
        const dependents = await this.queries.findDependents(ctx, pipelineCode, true);
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

    private async assertCodeAvailable(
        ctx: RequestContext,
        code: string,
        excludeId?: ID,
    ): Promise<void> {
        const existing = await this.connection.getRepository(ctx, Pipeline).findOne({
            where: { code },
        });
        if (existing && (!excludeId || existing.id !== excludeId)) {
            throw new Error(`Pipeline code "${code}" already exists`);
        }
    }
}
