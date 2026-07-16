import { describe, expect, it, vi } from 'vitest';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import type { Permission } from '@vendure/core';
import { AdapterType, PipelineStatus, RevisionType, StepType } from '../../constants/enums';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import { DataHubRegistryService } from '../../sdk/registry.service';
import type { PipelineDefinition } from '../../types';
import { DomainEventsService } from '../events/domain-events.service';
import { DataHubLoggerFactory } from '../logger';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { DiffService } from './diff.service';
import { RevisionService } from './revision.service';

const publishedDefinition: PipelineDefinition = {
    version: 1,
    capabilities: { requires: ['RunDataHubPipeline'] },
    steps: [{
        key: 'load-products',
        type: StepType.LOAD,
        config: { adapterCode: 'productUpsert' },
    }],
};

const changedDefinition: PipelineDefinition = {
    version: 1,
    steps: [{
        key: 'transform-products',
        type: StepType.TRANSFORM,
        config: { mapping: { name: 'name' } },
    }],
};

function createContext(granted: readonly string[]): RequestContext {
    const permissions = new Set(granted);
    return {
        activeUserId: 42,
        userHasPermissions: (requested: Permission[]) => requested.some(permission => permissions.has(permission)),
    } as unknown as RequestContext;
}

function createFixture(useUuidIds = false) {
    const ids = useUuidIds
        ? {
            pipeline: '10000000-0000-4000-8000-000000000001',
            previousRevision: '10000000-0000-4000-8000-000000000004',
            draftRevision: '10000000-0000-4000-8000-000000000008',
            targetRevision: '10000000-0000-4000-8000-000000000007',
            savedRevision: '10000000-0000-4000-8000-000000000009',
        }
        : {
            pipeline: 1,
            previousRevision: 4,
            draftRevision: 8,
            targetRevision: 7,
            savedRevision: 9,
        } satisfies Record<string, ID>;
    const pipeline = new Pipeline();
    pipeline.id = ids.pipeline;
    pipeline.code = 'catalog-sync';
    pipeline.name = 'Catalog sync';
    pipeline.enabled = true;
    pipeline.version = 2;
    pipeline.definition = publishedDefinition;
    pipeline.status = PipelineStatus.DRAFT;
    pipeline.currentRevisionId = ids.previousRevision;
    pipeline.draftRevisionId = ids.draftRevision;
    pipeline.publishedVersionCount = 2;
    pipeline.publishedAt = null;
    pipeline.publishedByUserId = null;

    const previousRevision = new PipelineRevision();
    previousRevision.id = ids.previousRevision;
    previousRevision.pipeline = pipeline;
    previousRevision.pipelineId = ids.pipeline;
    previousRevision.version = 2;
    previousRevision.type = RevisionType.PUBLISHED;
    previousRevision.definition = publishedDefinition;

    const targetRevision = new PipelineRevision();
    targetRevision.id = ids.targetRevision;
    targetRevision.pipeline = pipeline;
    targetRevision.pipelineId = ids.pipeline;
    targetRevision.version = 1;
    targetRevision.type = RevisionType.PUBLISHED;
    targetRevision.definition = changedDefinition;

    const pipelineRepository = {
        findOne: vi.fn(async () => pipeline),
        save: vi.fn(async (entity: Pipeline) => entity),
    };
    const revisionRepository = {
        findOne: vi.fn(async (options: { where: { id?: ID; type?: RevisionType } }) => {
            if (options.where.id === targetRevision.id) {
                return targetRevision;
            }
            if (options.where.id === previousRevision.id) {
                return previousRevision;
            }
            if (options.where.type === RevisionType.PUBLISHED) {
                return previousRevision;
            }
            return null;
        }),
        find: vi.fn(async () => []),
        save: vi.fn(async (revision: PipelineRevision) => {
            revision.id = ids.savedRevision;
            return revision;
        }),
        delete: vi.fn(async () => ({ affected: 0 })),
    };
    const connection = {
        withTransaction: vi.fn(async (
            ctx: RequestContext,
            work: (transactionCtx: RequestContext) => Promise<unknown>,
        ) => work(ctx)),
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => (
            entity === PipelineRevision ? revisionRepository : pipelineRepository
        )),
    };
    const definitionValidator = { validate: vi.fn() };
    const registry = {
        find: vi.fn((type: string, code: string) => (
            type === AdapterType.LOADER && code === 'productUpsert'
                ? {
                    type: AdapterType.LOADER,
                    code,
                    schema: { fields: [] },
                    requires: ['UpdateCatalog'],
                }
                : undefined
        )),
    };
    const domainEvents = { publishPipelinePublished: vi.fn() };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    };
    const loggerFactory = { createLogger: vi.fn(() => logger) };

    const service = new RevisionService(
        connection as unknown as TransactionalConnection,
        new DiffService(),
        definitionValidator as unknown as DefinitionValidationService,
        registry as unknown as DataHubRegistryService,
        domainEvents as unknown as DomainEventsService,
        loggerFactory as unknown as DataHubLoggerFactory,
    );

    return {
        service,
        pipeline,
        previousRevision,
        targetRevision,
        pipelineRepository,
        revisionRepository,
        definitionValidator,
        domainEvents,
    };
}

describe('RevisionService lifecycle', () => {
    const allPermissions = ['RunDataHubPipeline', 'UpdateCatalog'];

    it('publishes one complete revision and updates the pipeline atomically', async () => {
        const fixture = createFixture();
        const ctx = createContext(allPermissions);

        const revision = await fixture.service.publishVersion(ctx, {
            pipelineId: 1,
            commitMessage: '  Catalog release  ',
            authorUserId: 'spoofed-user',
            authorName: 'Administrator',
        });

        expect(revision.version).toBe(3);
        expect(revision.type).toBe(RevisionType.PUBLISHED);
        expect(revision.commitMessage).toBe('Catalog release');
        expect(revision.authorUserId).toBe('42');
        expect(revision.previousRevisionId).toBe(4);
        expect(revision.definitionHash).toHaveLength(64);
        expect(revision.definitionSize).toBeGreaterThan(0);
        expect(revision.changesSummary).not.toBeNull();
        expect(revision.definition.capabilities?.requires).toEqual([
            'RunDataHubPipeline',
            'UpdateCatalog',
        ]);
        expect(fixture.pipeline.version).toBe(3);
        expect(fixture.pipeline.publishedVersionCount).toBe(3);
        expect(fixture.pipeline.currentRevisionId).toBe(9);
        expect(fixture.pipeline.draftRevisionId).toBeNull();
        expect(fixture.pipeline.status).toBe(PipelineStatus.PUBLISHED);
        expect(fixture.revisionRepository.save).toHaveBeenCalledOnce();
        expect(fixture.pipelineRepository.save).toHaveBeenCalledOnce();
        expect(fixture.domainEvents.publishPipelinePublished).toHaveBeenCalledOnce();
    });

    it('preserves UUID pipeline and revision IDs through publication', async () => {
        const fixture = createFixture(true);

        const revision = await fixture.service.publishVersion(
            createContext(allPermissions),
            { pipelineId: fixture.pipeline.id },
        );

        expect(revision.pipelineId).toBe(fixture.pipeline.id);
        expect(revision.previousRevisionId).toBe(fixture.previousRevision.id);
        expect(fixture.pipeline.currentRevisionId).toBe(revision.id);
        expect(revision.id).toBe('10000000-0000-4000-8000-000000000009');
    });

    it('rejects publication when an effective adapter permission is missing', async () => {
        const fixture = createFixture();
        const ctx = createContext(['RunDataHubPipeline']);

        await expect(fixture.service.publishVersion(ctx, {
            pipelineId: 1,
            commitMessage: 'Release',
        })).rejects.toThrow(/UpdateCatalog/);

        expect(fixture.revisionRepository.save).not.toHaveBeenCalled();
        expect(fixture.pipelineRepository.save).not.toHaveBeenCalled();
        expect(fixture.domainEvents.publishPipelinePublished).not.toHaveBeenCalled();
    });

    it('rejects invalid lifecycle states before validating or saving', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.ARCHIVED;

        await expect(fixture.service.publishVersion(createContext(allPermissions), {
            pipelineId: 1,
        })).rejects.toThrow(/Cannot publish/);

        expect(fixture.definitionValidator.validate).not.toHaveBeenCalled();
        expect(fixture.revisionRepository.save).not.toHaveBeenCalled();
    });

    it('rejects an unsaved definition supplied to the publish mutation', async () => {
        const fixture = createFixture();

        await expect(fixture.service.publishVersion(createContext(allPermissions), {
            pipelineId: 1,
            definition: changedDefinition,
        })).rejects.toThrow(/Save the pipeline definition as a draft/);

        expect(fixture.revisionRepository.save).not.toHaveBeenCalled();
    });

    it('reverts a published pipeline by creating a new validated publication', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.PUBLISHED;

        const revision = await fixture.service.revertToRevision(
            createContext(allPermissions),
            { revisionId: fixture.targetRevision.id },
        );

        expect(revision.id).not.toBe(fixture.targetRevision.id);
        expect(revision.version).toBe(3);
        expect(revision.definition.steps).toEqual(changedDefinition.steps);
        expect(fixture.pipeline.status).toBe(PipelineStatus.PUBLISHED);
        expect(fixture.pipeline.currentRevisionId).toBe(9);
        expect(fixture.domainEvents.publishPipelinePublished).toHaveBeenCalledOnce();
    });

    it('moves a changed published working copy to draft without losing its active revision', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.PUBLISHED;
        fixture.pipeline.draftRevisionId = null;

        const saved = await fixture.service.saveDraft(createContext(allPermissions), {
            pipelineId: 1,
            definition: changedDefinition,
        });

        expect(saved?.type).toBe(RevisionType.DRAFT);
        expect(fixture.pipeline.status).toBe(PipelineStatus.DRAFT);
        expect(fixture.pipeline.currentRevisionId).toBe(4);
        expect(fixture.pipeline.draftRevisionId).toBe(9);
        expect(fixture.pipeline.definition).toEqual(changedDefinition);
    });

    it('restores a changed draft as the working copy and keeps the published pointer', async () => {
        const fixture = createFixture();
        fixture.pipeline.status = PipelineStatus.REVIEW;
        fixture.targetRevision.type = RevisionType.DRAFT;

        const restored = await fixture.service.restoreDraft(
            createContext(allPermissions),
            fixture.targetRevision.id,
        );

        expect(restored.status).toBe(PipelineStatus.DRAFT);
        expect(restored.currentRevisionId).toBe(4);
        expect(restored.draftRevisionId).toBe(7);
        expect(restored.definition).toEqual(changedDefinition);
    });
});
