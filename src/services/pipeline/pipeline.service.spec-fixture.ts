import { vi } from 'vitest';
import {
    EventBus,
    type ID,
    ListQueryBuilder,
    type RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    Pipeline,
    PipelineRevision,
    PipelineRun,
} from '../../entities/pipeline';
import {
    ConfigurationSource,
    PipelineStatus,
    RevisionType,
} from '../../constants/enums';
import type { PipelineDefinition } from '../../types';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { CheckpointService } from '../data/checkpoint.service';
import { DomainEventsService } from '../events/domain-events.service';
import { RevisionService } from '../versioning/revision.service';
import { DataHubLoggerFactory } from '../logger';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { PipelineService } from './pipeline.service';
import { PipelineExecutionPermissionService } from './pipeline-execution-permission.service';
import { PipelineRunCreationService } from './pipeline-run-creation.service';
import { PipelineRunGateService } from './pipeline-run-gate.service';
import { PipelineRunService } from './pipeline-run.service';
import { PipelineQueryService } from './pipeline-query.service';
import { PipelineMutationService } from './pipeline-mutation.service';
import { PipelineLifecycleService } from './pipeline-lifecycle.service';

export const publishedDefinition: PipelineDefinition = {
    version: 1,
    steps: [
        {
            key: 'orders-webhook',
            type: 'TRIGGER',
            config: { type: 'WEBHOOK' },
        },
        { key: 'published', type: 'TRANSFORM', config: {} },
    ],
    edges: [{ from: 'orders-webhook', to: 'published' }],
};

export const draftDefinition: PipelineDefinition = {
    version: 1,
    steps: [{ key: 'draft', type: 'TRANSFORM', config: {} }],
};

interface PipelineServiceFixtureIds {
    pipeline: ID;
    revision: ID;
    run: ID;
}

const NUMERIC_FIXTURE_IDS: PipelineServiceFixtureIds = {
    pipeline: 1,
    revision: 7,
    run: 9,
};

export function createPipelineServiceFixture(
    ids: PipelineServiceFixtureIds = NUMERIC_FIXTURE_IDS,
) {
    const pipeline = new Pipeline();
    pipeline.id = ids.pipeline;
    pipeline.code = 'catalog-sync';
    pipeline.name = 'Catalog sync';
    pipeline.enabled = true;
    pipeline.configurationSource = ConfigurationSource.DATABASE;
    pipeline.version = 1;
    pipeline.definition = draftDefinition;
    pipeline.status = PipelineStatus.PUBLISHED;
    pipeline.currentRevisionId = ids.revision;
    pipeline.draftRevisionId = null;
    pipeline.publishedVersionCount = 1;
    pipeline.rowVersion = 1;

    const revision = new PipelineRevision();
    revision.id = ids.revision;
    revision.pipeline = pipeline;
    revision.pipelineId = ids.pipeline;
    revision.version = 1;
    revision.type = RevisionType.PUBLISHED;
    revision.definition = publishedDefinition;

    let savedRun: PipelineRun | null = null;
    let checkpointData: Record<string, unknown> = {};
    let dependentRevisions: PipelineRevision[] = [];
    let repositoryPipelines: Pipeline[] = [pipeline];
    const dependentQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn(async () => repositoryPipelines),
    };
    const pipelineRepository = {
        findOne: vi.fn(async () => pipeline),
        find: vi.fn(async (options?: { where?: Record<string, unknown> }) => {
            if (options?.where && 'currentRevisionId' in options.where) {
                return repositoryPipelines.filter(item => item.currentRevisionId != null);
            }
            return repositoryPipelines;
        }),
        save: vi.fn(async (entity: Pipeline) => entity),
        update: vi.fn(async () => ({ affected: 1 })),
        remove: vi.fn(async (entity: Pipeline) => entity),
        createQueryBuilder: vi.fn(() => dependentQueryBuilder),
    };
    const revisionRepository = {
        findOne: vi.fn(async (): Promise<PipelineRevision | null> => revision),
        find: vi.fn(async () => [revision, ...dependentRevisions]),
    };
    const runRepository = {
        count: vi.fn().mockResolvedValue(0),
        findOne: vi.fn(async (options?: { where?: Record<string, unknown> }) => {
            if (!savedRun) return null;
            const where = options?.where;
            if (
                where?.id !== undefined
                && String(where.id) !== String(savedRun.id)
            ) {
                return null;
            }
            if (
                where?.channelId !== undefined
                && where.channelId !== savedRun.channelId
            ) {
                return null;
            }
            return savedRun;
        }),
        save: vi.fn(async (run: PipelineRun) => {
            run.id = ids.run;
            run.pipelineId = ids.pipeline;
            savedRun = run;
            return run;
        }),
        update: vi.fn(async (
            criteria: ID | { id: ID; status?: string; channelId?: string },
            updates: Partial<PipelineRun>,
        ) => {
            const structuredCriteria = typeof criteria === 'object' ? criteria : undefined;
            const criteriaId = structuredCriteria?.id ?? criteria;
            if (
                !savedRun
                || String(savedRun.id) !== String(criteriaId)
                || (
                    structuredCriteria?.status !== undefined
                    && savedRun.status !== structuredCriteria.status
                )
                || (
                    structuredCriteria?.channelId !== undefined
                    && savedRun.channelId !== structuredCriteria.channelId
                )
            ) {
                return { affected: 0 };
            }
            Object.assign(savedRun, updates);
            return { affected: 1 };
        }),
    };
    const runListQuery = {
        alias: 'pipelineRun',
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn(async () => [savedRun ? [savedRun] : [], savedRun ? 1 : 0]),
    };
    const listQueryBuilder = {
        build: vi.fn(() => runListQuery),
    };
    const connection = {
        getEntityOrThrow: vi.fn(async () => pipeline),
        findOneInChannel: vi.fn(async () => pipeline),
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => {
            if (entity === PipelineRevision) return revisionRepository;
            if (entity === PipelineRun) return runRepository;
            return pipelineRepository;
        }),
        withTransaction: vi.fn(async (
            ctx: RequestContext,
            work: (transactionCtx: RequestContext) => Promise<unknown>,
        ) => work(ctx)),
    };
    const eventBus = { publish: vi.fn(async () => undefined) };
    const definitionValidator = {
        validate: vi.fn(),
        validateAsync: vi.fn(async () => ({
            isValid: true,
            issues: [] as PipelineDefinitionIssue[],
            warnings: [] as PipelineDefinitionIssue[],
            level: 'FULL',
        })),
    };
    const domainEvents = {
        publishPipelineUpdated: vi.fn(),
        publishPipelineArchived: vi.fn(),
        publishPipelineReactivated: vi.fn(),
        publishPipelineDeleted: vi.fn(),
        publishGateApproved: vi.fn(),
        publishGateRejected: vi.fn(),
        publishRunCancelled: vi.fn(),
    };
    const revisionService = {
        publishVersion: vi.fn(async () => {
            pipeline.status = PipelineStatus.PUBLISHED;
            return { pipelineId: pipeline.id };
        }),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    };
    const loggerFactory = { createLogger: vi.fn(() => logger) };
    const checkpointService = {
        getByPipeline: vi.fn(async () => ({
            data: checkpointData,
        })),
        updateForPipeline: vi.fn(async (
            _ctx: RequestContext,
            _pipelineId: ID,
            updater: (current: Record<string, unknown>) => Record<string, unknown>,
        ) => {
            checkpointData = updater(structuredClone(checkpointData));
            return { data: checkpointData };
        }),
    };
    const executionPermissions = {
        assertAllowed: vi.fn(async () => undefined),
    };

    const runCreation = new PipelineRunCreationService(
        connection as unknown as TransactionalConnection,
        eventBus as unknown as EventBus,
        executionPermissions as unknown as PipelineExecutionPermissionService,
        loggerFactory as unknown as DataHubLoggerFactory,
    );
    const runGates = new PipelineRunGateService(
        connection as unknown as TransactionalConnection,
        eventBus as unknown as EventBus,
        checkpointService as unknown as CheckpointService,
        domainEvents as unknown as DomainEventsService,
        loggerFactory as unknown as DataHubLoggerFactory,
    );
    const pipelineRuns = new PipelineRunService(
        connection as unknown as TransactionalConnection,
        listQueryBuilder as unknown as ListQueryBuilder,
        domainEvents as unknown as DomainEventsService,
        runCreation,
        runGates,
        loggerFactory as unknown as DataHubLoggerFactory,
    );
    const queries = new PipelineQueryService(
        connection as unknown as TransactionalConnection,
        listQueryBuilder as unknown as ListQueryBuilder,
        { find: vi.fn() } as never,
    );
    const managedResourceChannels = {
        assignToCurrentChannel: vi.fn(async (_ctx, value) => value),
        prepareDelete: vi.fn(async () => ({
            entity: pipeline,
            physicallyDelete: true,
        })),
        removeFromActiveChannel: vi.fn(),
    };
    const mutations = new PipelineMutationService(
        connection as unknown as TransactionalConnection,
        definitionValidator as unknown as DefinitionValidationService,
        domainEvents as unknown as DomainEventsService,
        revisionService as unknown as RevisionService,
        managedResourceChannels as never,
        queries,
        loggerFactory as unknown as DataHubLoggerFactory,
    );
    const lifecycle = new PipelineLifecycleService(
        connection as unknown as TransactionalConnection,
        definitionValidator as unknown as DefinitionValidationService,
        domainEvents as unknown as DomainEventsService,
        revisionService as unknown as RevisionService,
        queries,
    );
    const service = new PipelineService(
        queries,
        mutations,
        lifecycle,
        pipelineRuns,
        definitionValidator as unknown as DefinitionValidationService,
        {} as AdapterRuntimeService,
        executionPermissions as unknown as PipelineExecutionPermissionService,
        loggerFactory as unknown as DataHubLoggerFactory,
    );

    return {
        service,
        ids,
        connection,
        pipeline,
        pipelineRepository,
        revisionRepository,
        runRepository,
        runListQuery,
        listQueryBuilder,
        eventBus,
        domainEvents,
        revisionService,
        checkpointService,
        definitionValidator,
        executionPermissions,
        setCheckpointData(data: Record<string, unknown>): void {
            checkpointData = data;
        },
        getCheckpointData(): Record<string, unknown> {
            return checkpointData;
        },
        setRun(run: PipelineRun): void {
            savedRun = run;
        },
        setDependentPipelines(pipelines: Pipeline[]): void {
            repositoryPipelines = [pipeline, ...pipelines];
        },
        setDependentRevisions(revisions: PipelineRevision[]): void {
            dependentRevisions = revisions;
        },
        setRepositoryPipelines(pipelines: Pipeline[]): void {
            repositoryPipelines = pipelines;
        },
    };
}
