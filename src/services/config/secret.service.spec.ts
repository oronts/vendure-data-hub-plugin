import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_SECURITY } from '../../constants';
import { SecretProvider } from '../../constants/enums';
import { SecretService } from './secret.service';

function createFixture(
    secrets: Array<{ code: string; provider: 'INLINE' | 'ENV'; value: string }> = [],
    databaseSecret: {
        code: string;
        provider: SecretProvider;
        value: string;
    } | null = null,
    enabled = true,
) {
    const repository = {
        findOne: vi.fn().mockResolvedValue(databaseSecret),
        find: vi.fn().mockResolvedValue(databaseSecret ? [databaseSecret] : []),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const service = new SecretService(
        { getRepository: vi.fn(() => repository) } as never,
        { secrets, enabled } as never,
        { createLogger: vi.fn(() => logger) } as never,
    );

    return { service, logger, repository };
}

describe('SecretService security modes', () => {
    beforeEach(() => {
        vi.stubEnv(SECRET_SECURITY.MASTER_KEY_ENV, '');
        vi.stubEnv(SECRET_SECURITY.NODE_ENV, 'test');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('rejects INLINE storage without encryption', async () => {
        const { service } = createFixture();

        await expect(service.encryptValue('secret')).rejects.toThrow(
            `INLINE secrets require ${SECRET_SECURITY.MASTER_KEY_ENV}`,
        );
    });

    it('rejects code-first INLINE secrets during initialization in strict mode', () => {
        const { service } = createFixture([
            { code: 'api-key', provider: 'INLINE', value: 'secret' },
        ]);

        expect(() => service.onModuleInit()).toThrow(
            `INLINE secret "api-key" requires ${SECRET_SECURITY.MASTER_KEY_ENV}`,
        );
    });

    it('rejects code-first INLINE secrets in production', () => {
        vi.stubEnv(SECRET_SECURITY.NODE_ENV, SECRET_SECURITY.PRODUCTION_ENV);
        vi.stubEnv(
            SECRET_SECURITY.MASTER_KEY_ENV,
            'a'.repeat(SECRET_SECURITY.MIN_MASTER_KEY_LENGTH),
        );
        const { service } = createFixture([
            { code: 'api-key', provider: 'INLINE', value: 'secret' },
        ]);

        expect(() => service.onModuleInit()).toThrow(
            'Code-first INLINE secret "api-key" is not allowed in production; use ENV',
        );
    });

    it('encrypts new INLINE values when a valid master key is configured', async () => {
        vi.stubEnv(
            SECRET_SECURITY.MASTER_KEY_ENV,
            'a'.repeat(SECRET_SECURITY.MIN_MASTER_KEY_LENGTH),
        );
        const { service } = createFixture();
        service.onModuleInit();

        await expect(service.encryptValue('secret')).resolves.toMatch(/^enc:v1:/);
    });

    it('rejects ENV fallback syntax during code-first registration', () => {
        const { service } = createFixture([
            {
                code: 'api-key',
                provider: 'ENV',
                value: 'TEST_SECRET_ENV|plaintext-fallback',
            },
        ]);

        expect(() => service.onModuleInit()).toThrow(
            'ENV secret "api-key" must reference one environment variable name',
        );
    });

    it('resolves a strict ENV reference from the process environment', async () => {
        vi.stubEnv('TEST_SECRET_ENV', 'runtime-secret');
        const { service } = createFixture([
            { code: 'api-key', provider: 'ENV', value: 'TEST_SECRET_ENV' },
        ]);
        service.onModuleInit();

        await expect(service.resolve({} as never, 'api-key')).resolves.toBe(
            'runtime-secret',
        );
    });

    it('rejects unencrypted database values', async () => {
        const { service } = createFixture([], {
            code: 'legacy-key',
            provider: SecretProvider.INLINE,
            value: 'legacy-plaintext',
        });
        service.onModuleInit();

        await expect(service.resolve({} as never, 'legacy-key')).rejects.toThrow(
            'Cannot resolve unencrypted INLINE secret',
        );
    });


    it('keeps the previous snapshot when replacement validation fails', async () => {
        vi.stubEnv('VALID_KEY', 'stable-value');
        const { service } = createFixture();
        service.replaceConfigSecrets([
            { code: 'valid-key', provider: 'ENV', value: 'VALID_KEY' },
        ]);

        expect(() =>
            service.replaceConfigSecrets([
                {
                    code: 'invalid-key',
                    provider: 'ENV',
                    value: 'INVALID_KEY|fallback',
                },
            ]),
        ).toThrow(
            'ENV secret "invalid-key" must reference one environment variable name',
        );
        await expect(service.resolve({} as never, 'valid-key')).resolves.toBe(
            'stable-value',
        );
    });

    it('replaces the complete registry snapshot and removes absent entries', async () => {
        vi.stubEnv('FIRST_KEY', 'first');
        vi.stubEnv('SECOND_KEY', 'second');
        const { service } = createFixture();
        service.replaceConfigSecrets([
            { code: 'first-key', provider: 'ENV', value: 'FIRST_KEY' },
            { code: 'second-key', provider: 'ENV', value: 'SECOND_KEY' },
        ]);

        service.replaceConfigSecrets([
            { code: 'first-key', provider: 'ENV', value: 'FIRST_KEY' },
        ]);

        await expect(service.resolve({} as never, 'first-key')).resolves.toBe('first');
        await expect(service.resolve({} as never, 'second-key')).resolves.toBeNull();
    });

    it('copies registered definitions instead of retaining caller-owned objects', async () => {
        vi.stubEnv('ORIGINAL_KEY', 'original');
        vi.stubEnv('CHANGED_KEY', 'changed');
        const definition: {
            code: string;
            provider: 'ENV';
            value: string;
        } = {
            code: 'api-key',
            provider: 'ENV',
            value: 'ORIGINAL_KEY',
        };
        const { service } = createFixture();

        service.replaceConfigSecrets([definition]);
        definition.value = 'CHANGED_KEY';

        await expect(service.resolve({} as never, 'api-key')).resolves.toBe('original');
    });

    it('rejects duplicate codes in a replacement snapshot', () => {
        const { service } = createFixture();

        expect(() =>
            service.replaceConfigSecrets([
                { code: 'api-key', provider: 'ENV', value: 'FIRST_KEY' },
                { code: 'api-key', provider: 'ENV', value: 'SECOND_KEY' },
            ]),
        ).toThrow('Duplicate code-first secret code');
    });

    it('skips secret validation when the plugin is disabled', () => {
        const { service } = createFixture(
            [{ code: 'api-key', provider: 'INLINE', value: 'secret' }],
            null,
            false,
        );

        expect(() => service.onModuleInit()).not.toThrow();
        expect(service.getConfigSecretCount()).toBe(0);
    });

});
