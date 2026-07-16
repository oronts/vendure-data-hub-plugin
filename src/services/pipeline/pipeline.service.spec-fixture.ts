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
import { PipelineStatus, RevisionType } from '../../constants/enums';
import type { PipelineDefinition } from '../../types';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { CheckpointService } from '../data/checkpoint.service';
import { DomainEventsService } from '../events/domain-events.service';
import { RevisionService } from '../versioning/revision.service';
import { DataHubLoggerFactory } from '../logger';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { PipelineService } from './pipeline.service';

export const publishedDefinition: PipelineDefinition = {
    version: 1,
    steps: [{ key: 'published', type: 'TRANSFORM', config: {} }],
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
    pipeline.version = 1;
    pipeline.definition = draftDefinition;
    pipeline.status = PipelineStatus.PUBLISHED;
    pipeline.currentRevisionId = ids.revision;
    pipeline.draftRevisionId = null;
    pipeline.publishedVersionCount = 1;

    const revision = new PipelineRevision();
    revision.id = ids.revision;
    revision.pipeline = pipeline;
    revision.pipelineId = ids.pipeline;
    revision.version = 1;
    revision.type = RevisionType.PUBLISHED;
    revision.definition = publishedDefinition;

    let savedRun: PipelineRun | null = null;
    const pipelineRepository = {
        findOne: vi.fn(async () => pipeline),
        save: vi.fn(async (entity: Pipeline) => entity),
    };
    const revisionRepository = {
        findOne: vi.fn(async (): Promise<PipelineRevision | null> => revision),
    };
    const runRepository = {
        findOne: vi.fn(async () => savedRun),
        save: vi.fn(async (run: PipelineRun) => {
            run.id = ids.run;
            run.pipelineId = ids.pipeline;
            savedRun = run;
            return run;
        }),
    };
    const connection = {
        getEntityOrThrow: vi.fn(async () => pipeline),
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => {
            if (entity === PipelineRevision) return revisionRepository;
            if (entity === PipelineRun) return runRepository;
            return pipelineRepository;
        }),
    };
    const eventBus = { publish: vi.fn() };
    const definitionValidator = { validate: vi.fn() };
    const domainEvents = { publishPipelineUpdated: vi.fn() };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    };
    const loggerFactory = { createLogger: vi.fn(() => logger) };

    const service = new PipelineService(
        connection as unknown as TransactionalConnection,
        {} as ListQueryBuilder,
        eventBus as unknown as EventBus,
        definitionValidator as unknown as DefinitionValidationService,
        {} as AdapterRuntimeService,
        { find: vi.fn() } as unknown as DataHubRegistryService,
        {} as CheckpointService,
        domainEvents as unknown as DomainEventsService,
        {} as RevisionService,
        loggerFactory as unknown as DataHubLoggerFactory,
    );

    return {
        service,
        pipeline,
        pipelineRepository,
        revisionRepository,
        runRepository,
        eventBus,
    };
}
