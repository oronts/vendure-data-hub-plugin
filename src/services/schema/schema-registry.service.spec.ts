import { describe, expect, it, vi } from 'vitest';
import { PipelineStatus, RevisionType } from '../../constants/enums';
import { DataHubSchema } from '../../entities/config';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import type { JsonObject } from '../../types';
import { SchemaRegistryService } from './schema-registry.service';

const DEFINITION: JsonObject = {
    fields: { sku: { type: 'string', required: true } },
};

function createFixture(options: {
    schema?: Partial<DataHubSchema> | null;
    pipelines?: Pipeline[];
    revisions?: PipelineRevision[];
    runs?: PipelineRun[];
} = {}) {
    const schema = options.schema === null
        ? null
        : {
            id: 1,
            schemaId: 'catalog.product',
            version: '1.0.0',
            compatibility: 'BACKWARD',
            definition: DEFINITION,
            metadata: null,
            ...options.schema,
        } as DataHubSchema;
    const schemaRepository = {
        findOne: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
            if (!schema) return null;
            if (where.id !== undefined) return where.id === schema.id ? schema : null;
            if (where.schemaId !== schema.schemaId) return null;
            if (where.version !== undefined && where.version !== schema.version) return null;
            return schema;
        }),
        find: vi.fn(async () => schema ? [schema] : []),
        save: vi.fn(async value => Object.assign(value, { id: value.id ?? 2 })),
        remove: vi.fn(async () => undefined),
    };
    const pipelineRepository = {
        find: vi.fn(async () => options.pipelines ?? []),
    };
    const revisionRepository = {
        find: vi.fn(async () => options.revisions ?? []),
    };
    const runRepository = {
        find: vi.fn(async () => options.runs ?? []),
    };
    const connection = {
        findOneInChannel: vi.fn(async () => schema),
        getRepository: vi.fn((_ctx, entity) => {
            if (entity === DataHubSchema) return schemaRepository;
            if (entity === Pipeline) return pipelineRepository;
            if (entity === PipelineRevision) return revisionRepository;
            if (entity === PipelineRun) return runRepository;
            throw new Error('Unexpected repository');
        }),
    };
    const service = new SchemaRegistryService(
        connection as never,
        {
            createLogger: vi.fn(() => ({
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            })),
        } as never,
        {
            assignToCurrentChannel: vi.fn(async (_ctx, value) => value),
            prepareDelete: vi.fn(async () => ({
                entity: schema,
                physicallyDelete: true,
            })),
            removeFromActiveChannel: vi.fn(),
        } as never,
    );
    return { service, schemaRepository };
}

function pipelineWithReference(): Pipeline {
    return {
        id: 10,
        code: 'catalog-import',
        name: 'Catalog import',
        status: PipelineStatus.PUBLISHED,
        definition: {
            version: 1,
            steps: [{
                key: 'source',
                type: 'EXTRACT',
                config: {},
                schemaRef: { schemaId: 'catalog.product', version: '1.0.0' },
            }],
        },
    } as Pipeline;
}

describe('SchemaRegistryService', () => {
    it('rejects duplicate versions before persistence', async () => {
        const { service, schemaRepository } = createFixture();
        await expect(service.create({} as never, {
            schemaId: 'catalog.product',
            version: '1.0.0',
            definition: DEFINITION,
        })).rejects.toThrow(/already exists/);
        expect(schemaRepository.save).not.toHaveBeenCalled();
    });

    it('enforces compatibility against the latest version', async () => {
        const { service, schemaRepository } = createFixture();
        await expect(service.create({} as never, {
            schemaId: 'catalog.product',
            version: '2.0.0',
            compatibility: 'BACKWARD',
            definition: {
                fields: {
                    sku: { type: 'string', required: true },
                    name: { type: 'string', required: true },
                },
            },
        })).rejects.toThrow(/not backward compatible/);
        expect(schemaRepository.save).not.toHaveBeenCalled();
    });

    it('protects versions referenced only by immutable revisions', async () => {
        const pipeline = pipelineWithReference();
        const revision = {
            id: 20,
            pipelineId: pipeline.id,
            type: RevisionType.PUBLISHED,
            definition: pipeline.definition,
        } as PipelineRevision;
        const { service, schemaRepository } = createFixture({
            pipelines: [{ ...pipeline, definition: { version: 1, steps: [] } } as Pipeline],
            revisions: [revision],
        });

        await expect(service.delete({} as never, 1)).rejects.toThrow(
            /catalog-import\/source/,
        );
        expect(schemaRepository.remove).not.toHaveBeenCalled();
    });

    it('protects versions referenced only by immutable run snapshots', async () => {
        const pipeline = pipelineWithReference();
        const run = {
            id: 30,
            pipelineId: pipeline.id,
            revisionId: 20,
            status: 'COMPLETED',
            definitionSnapshot: pipeline.definition,
        } as PipelineRun;
        const { service, schemaRepository } = createFixture({
            pipelines: [{ ...pipeline, definition: { version: 1, steps: [] } } as Pipeline],
            runs: [run],
        });

        await expect(service.delete({} as never, 1)).rejects.toThrow(/run 30/);
        expect(schemaRepository.remove).not.toHaveBeenCalled();
    });

    it('updates metadata without mutating an immutable version contract', async () => {
        const { service, schemaRepository } = createFixture();

        await expect(service.update({} as never, 1, {
            metadata: { owner: 'catalog-team' },
        })).resolves.toEqual(expect.objectContaining({
            definition: DEFINITION,
            compatibility: 'BACKWARD',
            metadata: { owner: 'catalog-team' },
        }));
        expect(schemaRepository.save).toHaveBeenCalledOnce();
    });

    it('rejects non-object metadata received through the JSON scalar', async () => {
        const { service, schemaRepository } = createFixture();

        await expect(service.update({} as never, 1, {
            metadata: [] as never,
        })).rejects.toThrow('Schema metadata must be a JSON object');
        expect(schemaRepository.save).not.toHaveBeenCalled();
    });

    it('reports working and revision usage with revision identity', async () => {
        const pipeline = pipelineWithReference();
        const revision = {
            id: 20,
            pipelineId: pipeline.id,
            type: RevisionType.PUBLISHED,
            definition: pipeline.definition,
        } as PipelineRevision;
        const { service } = createFixture({ pipelines: [pipeline], revisions: [revision] });

        await expect(service.findUsage(
            {} as never,
            'catalog.product',
            '1.0.0',
        )).resolves.toEqual([
            expect.objectContaining({ revisionId: null, revisionType: 'WORKING' }),
            expect.objectContaining({ revisionId: 20, revisionType: RevisionType.PUBLISHED }),
        ]);
    });

    it('returns record-level validation results for the bound version', async () => {
        const { service } = createFixture();
        const result = await service.validateRecords(
            {} as never,
            { schemaId: 'catalog.product', version: '1.0.0' },
            [{ sku: 'SKU-1' }, {}],
        );

        expect(result.records[0].issues).toEqual([]);
        expect(result.records[1].issues).toEqual([
            { path: '$.sku', message: 'is required' },
        ]);
    });
});
