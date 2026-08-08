import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ConfigurationSource,
    ConnectionType,
} from '../../constants/enums';
import type { JsonObject } from '../../types';
import { ConnectionService } from './connection.service';

function createService(
    config: JsonObject | null,
    type = ConnectionType.CUSTOM,
    configurationSource = ConfigurationSource.DATABASE,
) {
    const entity = config === null
        ? null
        : { id: '1', code: 'erp', type, config, configurationSource };
    const repository = {
        findOne: vi.fn().mockResolvedValue(entity),
        find: vi.fn().mockResolvedValue(entity ? [entity] : []),
        save: vi.fn(async value => ({ id: '1', ...value })),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        remove: vi.fn(),
    };
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const resourceReferences = {
        assertConnectionMutable: vi.fn(),
        assertConnectionUnassignable: vi.fn(),
    };
    const connection = {
        getRepository: vi.fn(() => repository),
        findOneInChannel: vi.fn(async () => entity),
    };
    const managedResourceChannels = {
        assignToCurrentChannel: vi.fn(async (_ctx, value) => value),
        prepareDelete: vi.fn(async () => ({
            entity,
            physicallyDelete: true,
        })),
        removeFromActiveChannel: vi.fn(),
    };
    const service = new ConnectionService(
        connection as never,
        resourceReferences as never,
        managedResourceChannels as never,
        { createLogger: vi.fn(() => logger) } as never,
    );
    return { service, entity, repository, resourceReferences };
}

describe('ConnectionService', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('resolves environment references deeply without mutating persisted config', async () => {
        vi.stubEnv('DATAHUB_HOST', 'erp.internal');
        vi.stubEnv('DATAHUB_PASSWORD', 'secret');
        const persistedConfig: JsonObject = {
            config: {
                url: 'https://${DATAHUB_HOST}/api',
                password: '${DATAHUB_PASSWORD}',
                fallbacks: ['${DATAHUB_HOST}', 3, null],
            },
        };
        const original = structuredClone(persistedConfig);
        const { service, entity } = createService(persistedConfig);

        await expect(service.getRuntimeByCode({} as never, 'erp')).resolves.toEqual({
            code: 'erp',
            type: ConnectionType.CUSTOM,
            config: {
                config: {
                    url: 'https://erp.internal/api',
                    password: 'secret',
                    fallbacks: ['erp.internal', 3, null],
                },
            },
        });
        expect(entity?.config).toEqual(original);
    });

    it('does not recursively interpolate environment values', async () => {
        vi.stubEnv('DATAHUB_PRIMARY', 'value-${DATAHUB_SECONDARY}');
        vi.stubEnv('DATAHUB_SECONDARY', 'expanded');
        const { service } = createService({ config: { value: '${DATAHUB_PRIMARY}' } });

        const runtime = await service.getRuntimeByCode({} as never, 'erp');

        expect((runtime?.config.config as JsonObject).value).toBe('value-${DATAHUB_SECONDARY}');
    });

    it('fails closed for missing, invalid, and malformed references', async () => {
        const missing = createService({ config: { value: '${DATAHUB_MISSING}' } }).service;
        await expect(missing.getRuntimeByCode({} as never, 'erp')).rejects.toThrow(
            'Missing environment variable "DATAHUB_MISSING" required by connection "erp"',
        );

        for (const value of ['${lowercase}', '${ BAD_NAME}', '${}', '${UNCLOSED']) {
            const { service } = createService({ config: { value } });
            await expect(service.getRuntimeByCode({} as never, 'erp')).rejects.toThrow(
                /environment variable reference/,
            );
        }
    });

    it('rejects prototype-mutating configuration keys', async () => {
        for (const key of ['__proto__', 'constructor', 'prototype']) {
            const nested = JSON.parse(`{"${key}": {"host": "internal"}}`) as JsonObject;
            const { service } = createService({ config: nested });
            await expect(service.getRuntimeByCode({} as never, 'erp')).rejects.toThrow(
                /Unsafe connection configuration key/,
            );
        }
    });

    it('returns null when the connection does not exist', async () => {
        const { service } = createService(null);
        await expect(service.getRuntimeByCode({} as never, 'missing')).resolves.toBeNull();
    });

    it('rejects plaintext credentials before persistence', async () => {
        const { service, repository } = createService(null);
        await expect(service.create({} as never, {
            code: 'erp',
            type: 'HTTP',
            config: {
                baseUrl: 'https://erp.example.com',
                auth: { type: 'BEARER', token: 'plaintext' },
            },
        })).rejects.toThrow(/plaintext credentials|does not support field/);
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('persists validated secret references', async () => {
        const { service, repository } = createService(null);
        await service.create({} as never, {
            code: 'erp',
            type: 'HTTP',
            config: {
                baseUrl: 'https://erp.example.com',
                auth: { type: 'BEARER', secretCode: 'erp-token' },
            },
        });
        expect(repository.save).toHaveBeenCalledOnce();
    });

    it('blocks renaming a connection referenced by a published pipeline', async () => {
        const { service, repository, resourceReferences } = createService({});
        resourceReferences.assertConnectionMutable.mockRejectedValue(
            new Error('connection is in use'),
        );

        await expect(service.update({} as never, '1', {
            code: 'renamed-erp',
        })).rejects.toThrow('connection is in use');

        expect(resourceReferences.assertConnectionMutable)
            .toHaveBeenCalledWith(expect.anything(), 'erp');
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('blocks changing the type of a referenced connection', async () => {
        const { service, repository, resourceReferences } = createService(
            { baseUrl: 'https://erp.example.com' },
            ConnectionType.HTTP,
        );
        resourceReferences.assertConnectionMutable.mockRejectedValue(
            new Error('connection is in use'),
        );

        await expect(service.update({} as never, '1', {
            type: ConnectionType.CUSTOM,
            config: { config: { endpoint: 'https://erp.example.com' } },
        })).rejects.toThrow('connection is in use');

        expect(resourceReferences.assertConnectionMutable)
            .toHaveBeenCalledWith(expect.anything(), 'erp');
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('allows rotating config without changing a referenced connection type', async () => {
        const { service, repository, resourceReferences } = createService(
            { baseUrl: 'https://erp.example.com' },
            ConnectionType.HTTP,
        );

        await service.update({} as never, '1', {
            config: { baseUrl: 'https://new-erp.example.com' },
        });

        expect(resourceReferences.assertConnectionMutable).not.toHaveBeenCalled();
        expect(repository.save).toHaveBeenCalledOnce();
    });

    it('blocks deleting a connection referenced by a published pipeline', async () => {
        const { service, repository, resourceReferences } = createService({});
        resourceReferences.assertConnectionMutable.mockRejectedValue(
            new Error('connection is in use'),
        );

        await expect(service.delete({} as never, '1'))
            .rejects.toThrow('connection is in use');

        expect(repository.remove).not.toHaveBeenCalled();
    });

    it('blocks manual mutation while code-first configuration owns the connection', async () => {
        const { service, repository } = createService(
            { baseUrl: 'https://erp.example.com' },
            ConnectionType.HTTP,
            ConfigurationSource.CODE_FIRST,
        );

        await expect(service.update({} as never, '1', {
            config: { baseUrl: 'https://changed.example.com' },
        })).rejects.toThrow(/managed by code-first configuration/);
        await expect(service.delete({} as never, '1')).rejects.toThrow(
            /managed by code-first configuration/,
        );

        expect(repository.save).not.toHaveBeenCalled();
        expect(repository.remove).not.toHaveBeenCalled();
    });

    it('allows synchronization to update and retain code-first ownership', async () => {
        const { service, entity, repository } = createService(
            { baseUrl: 'https://old.example.com' },
            ConnectionType.HTTP,
            ConfigurationSource.CODE_FIRST,
        );

        await service.update({} as never, '1', {
            config: { baseUrl: 'https://new.example.com' },
        }, {
            configurationSource: ConfigurationSource.CODE_FIRST,
            allowCodeFirstManaged: true,
        });

        expect(entity?.configurationSource).toBe(ConfigurationSource.CODE_FIRST);
        expect(repository.save).toHaveBeenCalledOnce();
    });

    it('releases stale code-first ownership without deleting the connection', async () => {
        const { service, repository } = createService(
            { baseUrl: 'https://erp.example.com' },
            ConnectionType.HTTP,
            ConfigurationSource.CODE_FIRST,
        );

        await expect(
            service.releaseCodeFirstOwnership({} as never, new Set()),
        ).resolves.toBe(1);

        expect(repository.update).toHaveBeenCalledWith(
            { id: '1' },
            { configurationSource: ConfigurationSource.DATABASE },
        );
        expect(repository.remove).not.toHaveBeenCalled();
    });
});
