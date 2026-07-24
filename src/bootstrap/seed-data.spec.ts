import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ConfigurationSource,
    ConnectionType,
    PipelineStatus,
    StepType,
} from '../constants/enums';
import { JsonObject } from '../types';
import { ConfigSyncService } from './seed-data';

function createProcessContext(isServer = true) {
    return { isServer };
}

function createLockService(acquired = true) {
    return {
        acquire: vi.fn().mockResolvedValue(
            acquired
                ? { acquired: true, token: 'config-sync-token' }
                : { acquired: false },
        ),
        release: vi.fn().mockResolvedValue(undefined),
    };
}

function createRegistry() {
    return { find: vi.fn() };
}

function createManagedResourceChannels() {
    return {
        initializeDefaultChannel: vi.fn().mockResolvedValue(0),
        countUnassigned: vi.fn().mockResolvedValue(0),
    };
}

function createConnectionServiceMock(overrides: Record<string, unknown> = {}) {
    return {
        getByCode: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        releaseCodeFirstOwnership: vi.fn().mockResolvedValue(0),
        ...overrides,
    };
}

function createPipelineServiceMock(overrides: Record<string, unknown> = {}) {
    return {
        findByCode: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        claimCodeFirstOwnership: vi.fn().mockResolvedValue(undefined),
        refreshCodeFirstPublishedDefinition: vi.fn().mockResolvedValue(undefined),
        releaseCodeFirstOwnership: vi.fn().mockResolvedValue(0),
        ...overrides,
    };
}

function createSyncFixture(
    settings: JsonObject,
    existing: {
        id: number;
        code: string;
        type: ConnectionType;
        config: JsonObject;
        configurationSource?: ConfigurationSource;
    } | null = null,
) {
    const repository = {
        save: vi.fn(async value => value),
    };
    const requestContextService = {
        create: vi.fn().mockResolvedValue({}),
    };
    const secretService = {
        getConfigSecretCount: vi.fn().mockReturnValue(0),
    };
    const pipelineService = createPipelineServiceMock();
    const connectionService = createConnectionServiceMock({
        getByCode: vi.fn().mockResolvedValue(existing),
        create: vi.fn(async (_ctx, input) => repository.save(input)),
        update: vi.fn(async (_ctx, _id, input) => {
            if (!existing) return null;
            Object.assign(existing, input);
            return repository.save(existing);
        }),
    });
    const distributedLock = createLockService();
    const service = new ConfigSyncService(
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
        connectionService as never,
        pipelineService as never,
        createProcessContext() as never,
        distributedLock as never,
        createRegistry() as never,
        createManagedResourceChannels() as never,
    );
    return { connectionService, distributedLock, pipelineService, service, repository };
}

describe('ConfigSyncService persistence', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.useRealTimers();
    });

    it('does not persist code-first secret values during database sync', async () => {
        const requestContextService = {
            create: vi.fn().mockResolvedValue({}),
        };
        const secretService = {
            getConfigSecretCount: vi.fn().mockReturnValue(1),
        };
        const connectionService = createConnectionServiceMock();
        const pipelineService = createPipelineServiceMock();
        const service = new ConfigSyncService(
            requestContextService as never,
            secretService as never,
            { enabled: true } as never,
            connectionService as never,
            pipelineService as never,
            createProcessContext() as never,
            createLockService() as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        await service.onApplicationBootstrap();

        expect(secretService.getConfigSecretCount).toHaveBeenCalledOnce();
        expect(requestContextService.create).toHaveBeenCalledOnce();
        expect(connectionService.releaseCodeFirstOwnership)
            .toHaveBeenCalledWith({}, new Set());
        expect(pipelineService.releaseCodeFirstOwnership)
            .toHaveBeenCalledWith({}, new Set());
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
        const existing = {
            id: 4,
            code: 'erp',
            type: ConnectionType.HTTP,
            config: { baseUrl: 'https://old.example.com' },
        };
        const { connectionService, service, repository } = createSyncFixture(settings, existing);

        await service.onApplicationBootstrap();

        expect(existing.config).toEqual(settings);
        expect(repository.save).toHaveBeenCalledWith(existing);
        expect(connectionService.update).toHaveBeenCalledWith(
            {},
            4,
            { type: ConnectionType.HTTP, config: settings },
            {
                configurationSource: ConfigurationSource.CODE_FIRST,
                allowCodeFirstManaged: true,
            },
        );
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
        const { service, repository } = createSyncFixture({ password: 'plaintext' });

        await expect(service.onApplicationBootstrap()).rejects.toThrow(
            'Connection erp',
        );

        expect(repository.save).not.toHaveBeenCalled();
    });

    it('routes existing code-first pipelines through lifecycle-aware updates', async () => {
        const existing = { id: 7, code: 'catalog-sync' };
        const pipelineService = createPipelineServiceMock({
            findByCode: vi.fn().mockResolvedValue(existing),
            update: vi.fn().mockResolvedValue(existing),
        });
        const connectionService = createConnectionServiceMock();
        const requestContextService = {
            create: vi.fn().mockResolvedValue({ apiType: 'admin' }),
        };
        const service = new ConfigSyncService(
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
            connectionService as never,
            pipelineService as never,
            createProcessContext() as never,
            createLockService() as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        await service.onApplicationBootstrap();

        expect(pipelineService.update).toHaveBeenCalledWith(
            { apiType: 'admin' },
            {
                id: 7,
                name: 'Catalog sync',
                enabled: false,
                definition: {
                    version: 1,
                    steps: [],
                    capabilities: { requires: [] },
                },
            },
            {
                configurationSource: ConfigurationSource.CODE_FIRST,
                allowCodeFirstManaged: true,
            },
        );
        expect(pipelineService.create).not.toHaveBeenCalled();
    });

    it('routes new code-first pipelines through canonical creation', async () => {
        const pipelineService = createPipelineServiceMock({
            create: vi.fn().mockResolvedValue({ id: 8 }),
        });
        const connectionService = createConnectionServiceMock();
        const service = new ConfigSyncService(
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
            connectionService as never,
            pipelineService as never,
            createProcessContext() as never,
            createLockService() as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        await service.onApplicationBootstrap();

        expect(pipelineService.create).toHaveBeenCalledWith(
            {},
            {
                code: 'inventory-sync',
                name: 'Inventory sync',
                definition: {
                    version: 2,
                    steps: [],
                    capabilities: { requires: [] },
                },
                enabled: true,
                version: 2,
            },
            { configurationSource: ConfigurationSource.CODE_FIRST },
        );
        expect(pipelineService.update).not.toHaveBeenCalled();
    });

    it('checks channel backfill readiness even when no code-first configuration is declared', async () => {
        const distributedLock = createLockService();
        const requestContextService = { create: vi.fn().mockResolvedValue({}) };
        const secretService = { getConfigSecretCount: vi.fn() };
        const service = new ConfigSyncService(
            requestContextService as never,
            secretService as never,
            { enabled: true } as never,
            {} as never,
            {} as never,
            createProcessContext(false) as never,
            distributedLock as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        await service.onApplicationBootstrap();

        expect(distributedLock.acquire).not.toHaveBeenCalled();
        expect(secretService.getConfigSecretCount).not.toHaveBeenCalled();
        expect(requestContextService.create).toHaveBeenCalledWith({ apiType: 'admin' });
    });

    it('waits read-only until server-owned configuration is persisted', async () => {
        vi.useFakeTimers();
        const settings: JsonObject = { baseUrl: 'https://example.com' };
        const connectionService = {
            getByCode: vi.fn()
                .mockResolvedValueOnce(null)
                .mockResolvedValue({
                    id: 1,
                    code: 'erp',
                    type: ConnectionType.HTTP,
                    config: settings,
                    configurationSource: ConfigurationSource.CODE_FIRST,
                }),
            create: vi.fn(),
            update: vi.fn(),
        };
        const distributedLock = createLockService();
        const service = new ConfigSyncService(
            { create: vi.fn().mockResolvedValue({}) } as never,
            { getConfigSecretCount: vi.fn() } as never,
            {
                enabled: true,
                connections: [{
                    code: 'erp',
                    type: ConnectionType.HTTP,
                    settings,
                }],
            } as never,
            connectionService as never,
            {} as never,
            createProcessContext(false) as never,
            distributedLock as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        const readiness = service.ensureSynchronized();
        await vi.advanceTimersByTimeAsync(1_000);
        await readiness;

        expect(connectionService.getByCode).toHaveBeenCalledTimes(2);
        expect(connectionService.create).not.toHaveBeenCalled();
        expect(connectionService.update).not.toHaveBeenCalled();
        expect(distributedLock.acquire).not.toHaveBeenCalled();
    });

    it('reports the unresolved worker configuration code on timeout', async () => {
        vi.useFakeTimers();
        const service = new ConfigSyncService(
            { create: vi.fn().mockResolvedValue({}) } as never,
            { getConfigSecretCount: vi.fn() } as never,
            {
                enabled: true,
                pipelines: [{
                    code: 'inventory-sync',
                    name: 'Inventory sync',
                    definition: { version: 1, steps: [] },
                }],
            } as never,
            {} as never,
            { findByCode: vi.fn().mockResolvedValue(null) } as never,
            createProcessContext(false) as never,
            createLockService() as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        const readiness = expect(service.ensureSynchronized()).rejects.toThrow(
            'pipeline:inventory-sync',
        );
        await vi.advanceTimersByTimeAsync(60_000);

        await readiness;
    });

    it('serializes synchronization with one distributed lock', async () => {
        const { distributedLock, service } = createSyncFixture({
            baseUrl: 'https://example.com/api',
        });

        await service.onApplicationBootstrap();

        expect(distributedLock.acquire).toHaveBeenCalledOnce();
        expect(distributedLock.release).toHaveBeenCalledWith(
            'data-hub:config-sync',
            'config-sync-token',
        );
    });

    it('deduplicates concurrent synchronization requests', async () => {
        const { distributedLock, service } = createSyncFixture({
            baseUrl: 'https://example.com/api',
        });

        await Promise.all([
            service.ensureSynchronized(),
            service.ensureSynchronized(),
            service.onApplicationBootstrap(),
        ]);

        expect(distributedLock.acquire).toHaveBeenCalledOnce();
        expect(distributedLock.release).toHaveBeenCalledOnce();
    });

    it('does not rewrite an unchanged connection', async () => {
        const settings: JsonObject = { baseUrl: 'https://example.com/api' };
        const existing = {
            id: 4,
            code: 'erp',
            type: ConnectionType.HTTP,
            config: settings,
            configurationSource: ConfigurationSource.CODE_FIRST,
        };
        const { connectionService, repository, service } = createSyncFixture(
            { ...settings },
            existing,
        );

        await service.onApplicationBootstrap();

        expect(connectionService.update).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('does not rewrite an unchanged pipeline', async () => {
        const definition = {
            version: 1,
            steps: [],
            capabilities: { requires: [] },
        };
        const pipelineService = createPipelineServiceMock({
            findByCode: vi.fn().mockResolvedValue({
                id: 7,
                code: 'catalog-sync',
                name: 'Catalog sync',
                enabled: true,
                definition,
                configurationSource: ConfigurationSource.CODE_FIRST,
            }),
        });
        const connectionService = createConnectionServiceMock();
        const service = new ConfigSyncService(
            { create: vi.fn().mockResolvedValue({}) } as never,
            { getConfigSecretCount: vi.fn().mockReturnValue(0) } as never,
            {
                enabled: true,
                pipelines: [{
                    code: 'catalog-sync',
                    name: 'Catalog sync',
                    definition: { version: 1, steps: [] },
                }],
            } as never,
            connectionService as never,
            pipelineService as never,
            createProcessContext() as never,
            createLockService() as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        await service.onApplicationBootstrap();

        expect(pipelineService.create).not.toHaveBeenCalled();
        expect(pipelineService.update).not.toHaveBeenCalled();
        expect(pipelineService.refreshCodeFirstPublishedDefinition)
            .not.toHaveBeenCalled();
    });

    it('refreshes bindings for an unchanged published code-first pipeline', async () => {
        const definition = {
            version: 1,
            steps: [
                {
                    key: 'extract',
                    type: StepType.EXTRACT,
                    config: { adapterCode: 'inMemory' },
                },
                {
                    key: 'load',
                    type: StepType.LOAD,
                    config: { adapterCode: 'productUpsert' },
                },
            ],
            edges: [{ from: 'extract', to: 'load' }],
            capabilities: { requires: [] },
        };
        const existing = {
            id: 7,
            code: 'catalog-sync',
            name: 'Catalog sync',
            enabled: true,
            definition,
            configurationSource: ConfigurationSource.CODE_FIRST,
            status: PipelineStatus.PUBLISHED,
            currentRevisionId: 11,
        };
        const pipelineService = createPipelineServiceMock({
            findByCode: vi.fn().mockResolvedValue(existing),
        });
        const registry = {
            find: vi.fn((type: string, code: string) => (
                (type === 'EXTRACTOR' && code === 'inMemory')
                || (type === 'LOADER' && code === 'productUpsert')
                    ? {
                        type,
                        code,
                        version: '1.0.0',
                        apiVersion: 1,
                        schema: { fields: [] },
                    }
                    : undefined
            )),
        };
        const service = new ConfigSyncService(
            { create: vi.fn().mockResolvedValue({}) } as never,
            { getConfigSecretCount: vi.fn().mockReturnValue(0) } as never,
            {
                enabled: true,
                pipelines: [{
                    code: 'catalog-sync',
                    name: 'Catalog sync',
                    definition: {
                        version: 1,
                        steps: definition.steps,
                        edges: definition.edges,
                    },
                }],
            } as never,
            createConnectionServiceMock() as never,
            pipelineService as never,
            createProcessContext() as never,
            createLockService() as never,
            registry as never,
            createManagedResourceChannels() as never,
        );

        await service.onApplicationBootstrap();

        expect(pipelineService.refreshCodeFirstPublishedDefinition)
            .toHaveBeenCalledWith(
                {},
                7,
                expect.objectContaining({
                    adapterBindings: [
                        {
                            location: 'steps.extract',
                            type: 'EXTRACTOR',
                            code: 'inMemory',
                            version: '1.0.0',
                            apiVersion: 1,
                        },
                        {
                            location: 'steps.load',
                            type: 'LOADER',
                            code: 'productUpsert',
                            version: '1.0.0',
                            apiVersion: 1,
                        },
                    ],
                }),
            );
        expect(pipelineService.update).not.toHaveBeenCalled();
    });

    it('does not rewrite inferred resource permissions after publication', async () => {
        const sourceDefinition = {
            version: 1,
            steps: [{
                key: 'remote-source',
                type: StepType.EXTRACT,
                config: {
                    adapterCode: 'httpApi',
                    connectionCode: 'erp',
                },
            }],
        };
        const pipelineService = createPipelineServiceMock({
            findByCode: vi.fn().mockResolvedValue({
                id: 7,
                code: 'catalog-sync',
                name: 'Catalog sync',
                enabled: true,
                definition: {
                    ...sourceDefinition,
                    capabilities: {
                        requires: ['UseDataHubConnection', 'UseDataHubSecret'],
                    },
                },
                configurationSource: ConfigurationSource.CODE_FIRST,
            }),
        });
        const connectionService = createConnectionServiceMock();
        const service = new ConfigSyncService(
            { create: vi.fn().mockResolvedValue({}) } as never,
            { getConfigSecretCount: vi.fn().mockReturnValue(0) } as never,
            {
                enabled: true,
                pipelines: [{
                    code: 'catalog-sync',
                    name: 'Catalog sync',
                    definition: sourceDefinition,
                }],
            } as never,
            connectionService as never,
            pipelineService as never,
            createProcessContext() as never,
            createLockService() as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        await service.onApplicationBootstrap();

        expect(pipelineService.update).not.toHaveBeenCalled();
    });

    it('accepts canonical resource permissions during worker readiness', async () => {
        const sourceDefinition = {
            version: 1,
            steps: [{
                key: 'remote-source',
                type: StepType.EXTRACT,
                config: {
                    adapterCode: 'httpApi',
                    connectionCode: 'erp',
                },
            }],
        };
        const pipelineService = createPipelineServiceMock({
            findByCode: vi.fn().mockResolvedValue({
                id: 7,
                code: 'catalog-sync',
                name: 'Catalog sync',
                enabled: true,
                definition: {
                    ...sourceDefinition,
                    capabilities: {
                        requires: ['UseDataHubConnection', 'UseDataHubSecret'],
                    },
                },
                configurationSource: ConfigurationSource.CODE_FIRST,
            }),
        });
        const requestContextService = {
            create: vi.fn().mockResolvedValue({ apiType: 'admin' }),
        };
        const service = new ConfigSyncService(
            requestContextService as never,
            { getConfigSecretCount: vi.fn() } as never,
            {
                enabled: true,
                pipelines: [{
                    code: 'catalog-sync',
                    name: 'Catalog sync',
                    definition: sourceDefinition,
                }],
            } as never,
            {} as never,
            pipelineService as never,
            createProcessContext(false) as never,
            createLockService() as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
        expect(pipelineService.findByCode).toHaveBeenCalledOnce();
    });

    it('validates all records before writing any valid record', async () => {
        const repository = { save: vi.fn() };
        const connectionService = {
            getByCode: vi.fn().mockResolvedValue(null),
            create: vi.fn(async (_ctx, input) => repository.save(input)),
            update: vi.fn(),
        };
        const distributedLock = createLockService();
        const service = new ConfigSyncService(
            { create: vi.fn().mockResolvedValue({}) } as never,
            { getConfigSecretCount: vi.fn().mockReturnValue(0) } as never,
            {
                enabled: true,
                connections: [
                    {
                        code: 'valid-erp',
                        type: ConnectionType.HTTP,
                        settings: { baseUrl: 'https://example.com' },
                    },
                    {
                        code: 'invalid-erp',
                        type: ConnectionType.HTTP,
                        settings: { password: 'plaintext' },
                    },
                ],
            } as never,
            connectionService as never,
            {} as never,
            createProcessContext() as never,
            distributedLock as never,
            createRegistry() as never,
            createManagedResourceChannels() as never,
        );

        await expect(service.onApplicationBootstrap()).rejects.toThrow(
            'Connection invalid-erp',
        );

        expect(connectionService.create).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
        expect(distributedLock.release).toHaveBeenCalledOnce();
    });
});
