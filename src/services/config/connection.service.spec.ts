import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionType } from '../../constants/enums';
import type { JsonObject } from '../../types';
import { ConnectionService } from './connection.service';

function createService(config: JsonObject | null, type = ConnectionType.CUSTOM) {
    const entity = config === null ? null : { id: '1', code: 'erp', type, config };
    const repository = {
        findOne: vi.fn().mockResolvedValue(entity),
        save: vi.fn(async value => ({ id: '1', ...value })),
        remove: vi.fn(),
    };
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const resourceReferences = {
        assertConnectionMutable: vi.fn(),
    };
    const service = new ConnectionService(
        { getRepository: vi.fn(() => repository) } as never,
        resourceReferences as never,
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

    it('blocks deleting a connection referenced by a published pipeline', async () => {
        const { service, repository, resourceReferences } = createService({});
        resourceReferences.assertConnectionMutable.mockRejectedValue(
            new Error('connection is in use'),
        );

        await expect(service.delete({} as never, '1'))
            .rejects.toThrow('connection is in use');

        expect(repository.remove).not.toHaveBeenCalled();
    });
});
