import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionType } from '../constants/enums';
import { JsonObject } from '../types';
import { ConfigSyncService } from './seed-data';

function createSyncFixture(settings: JsonObject, existing: { type: ConnectionType; config: JsonObject } | null = null) {
    const repository = {
        findOne: vi.fn().mockResolvedValue(existing),
        save: vi.fn(async value => value),
    };
    const connection = {
        getRepository: vi.fn(() => repository),
    };
    const requestContextService = {
        create: vi.fn().mockResolvedValue({}),
    };
    const secretService = {
        getConfigSecretCount: vi.fn().mockReturnValue(0),
    };
    const pipelineService = {
        findByCode: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    };
    const service = new ConfigSyncService(
        connection as never,
        requestContextService as never,
        secretService as never,
        {
            enabled: true,
            connections: [{
                code: 'erp',
                type: ConnectionType.HTTP,
                settings,
            }],
        } as never,
        pipelineService as never,
    );
    return { service, repository };
}

describe('ConfigSyncService persistence', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.useRealTimers();
    });

    it('does not persist code-first secret values during database sync', async () => {
        const connection = {
            getRepository: vi.fn(),
        };
        const requestContextService = {
            create: vi.fn(),
        };
        const secretService = {
            getConfigSecretCount: vi.fn().mockReturnValue(1),
        };
        const pipelineService = {
            findByCode: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        };
        const service = new ConfigSyncService(
            connection as never,
            requestContextService as never,
            secretService as never,
            { enabled: true } as never,
            pipelineService as never,
        );

        await service.onApplicationBootstrap();

        expect(secretService.getConfigSecretCount).toHaveBeenCalledOnce();
        expect(requestContextService.create).not.toHaveBeenCalled();
        expect(connection.getRepository).not.toHaveBeenCalled();
    });

    it('persists environment references verbatim on create without reading their values', async () => {
        vi.stubEnv('DATAHUB_SYNC_SECRET', 'must-not-be-persisted');
        const settings: JsonObject = {
            baseUrl: 'https://example.com/api',
            headers: { 'X-Sync-Reference': '${DATAHUB_SYNC_SECRET}' },
        };
        const { service, repository } = createSyncFixture(settings);

        await service.onApplicationBootstrap();

        const saved = repository.save.mock.calls[0][0] as { config: JsonObject };
        expect(saved.config).toEqual(settings);
        expect(JSON.stringify(saved.config)).not.toContain('must-not-be-persisted');
    });

    it('keeps references verbatim on update', async () => {
        const settings: JsonObject = {
            baseUrl: 'https://example.com/api',
            headers: { 'X-Sync-Reference': '${DATAHUB_UPDATED_SECRET}' },
        };
        const existing = { type: ConnectionType.HTTP, config: { baseUrl: 'https://old.example.com' } };
        const { service, repository } = createSyncFixture(settings, existing);

        await service.onApplicationBootstrap();

        expect(existing.config).toEqual(settings);
        expect(repository.save).toHaveBeenCalledWith(existing);
    });

    it('syncs missing environment references without replacing them with empty strings', async () => {
        const settings: JsonObject = {
            baseUrl: 'https://example.com/api',
            headers: { 'X-Sync-Reference': '${DATAHUB_NOT_DEFINED}' },
        };
        const { service, repository } = createSyncFixture(settings);

        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

        const saved = repository.save.mock.calls[0][0] as { config: JsonObject };
        expect(saved.config).toEqual(settings);
    });

    it('rejects invalid code-first fields without persisting them', async () => {
        vi.useFakeTimers();
        const { service, repository } = createSyncFixture({ password: 'plaintext' });

        const startup = expect(service.onApplicationBootstrap()).rejects.toThrow(
            'Failed to sync 1 DataHub configuration records',
        );
        await vi.runAllTimersAsync();
        await startup;

        expect(repository.save).not.toHaveBeenCalled();
    });

    it('routes existing code-first pipelines through lifecycle-aware updates', async () => {
        const existing = { id: 7, code: 'catalog-sync' };
        const pipelineService = {
            findByCode: vi.fn().mockResolvedValue(existing),
            create: vi.fn(),
            update: vi.fn().mockResolvedValue(existing),
        };
        const connection = { getRepository: vi.fn() };
        const requestContextService = {
            create: vi.fn().mockResolvedValue({ apiType: 'admin' }),
        };
        const service = new ConfigSyncService(
            connection as never,
            requestContextService as never,
            { getConfigSecretCount: vi.fn().mockReturnValue(0) } as never,
            {
                enabled: true,
                pipelines: [{
                    code: 'catalog-sync',
                    name: 'Catalog sync',
                    enabled: false,
                    definition: { version: 1, steps: [] },
                }],
            } as never,
            pipelineService as never,
        );

        await service.onApplicationBootstrap();

        expect(pipelineService.update).toHaveBeenCalledWith(
            { apiType: 'admin' },
            {
                id: 7,
                name: 'Catalog sync',
                enabled: false,
                definition: { version: 1, steps: [] },
            },
        );
        expect(pipelineService.create).not.toHaveBeenCalled();
        expect(connection.getRepository).not.toHaveBeenCalled();
    });

    it('routes new code-first pipelines through canonical creation', async () => {
        const pipelineService = {
            findByCode: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 8 }),
            update: vi.fn(),
        };
        const service = new ConfigSyncService(
            { getRepository: vi.fn() } as never,
            { create: vi.fn().mockResolvedValue({}) } as never,
            { getConfigSecretCount: vi.fn().mockReturnValue(0) } as never,
            {
                enabled: true,
                pipelines: [{
                    code: 'inventory-sync',
                    name: 'Inventory sync',
                    definition: { version: 2, steps: [] },
                }],
            } as never,
            pipelineService as never,
        );

        await service.onApplicationBootstrap();

        expect(pipelineService.create).toHaveBeenCalledWith({}, {
            code: 'inventory-sync',
            name: 'Inventory sync',
            definition: { version: 2, steps: [] },
            enabled: true,
            version: 2,
        });
        expect(pipelineService.update).not.toHaveBeenCalled();
    });
});
