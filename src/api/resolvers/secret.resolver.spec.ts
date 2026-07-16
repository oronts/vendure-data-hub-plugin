import { describe, expect, it, vi } from 'vitest';
import {
    ListQueryBuilder,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { SecretProvider } from '../../constants/enums';
import { DataHubSecret } from '../../entities/config';
import { SecretService } from '../../services/config/secret.service';
import { DataHubLoggerFactory } from '../../services/logger';
import { DataHubSecretAdminResolver } from './secret.resolver';

function createFixture() {
    const secret = new DataHubSecret();
    secret.id = 1;
    secret.createdAt = new Date('2026-07-14T10:00:00.000Z');
    secret.updatedAt = new Date('2026-07-14T10:00:00.000Z');
    secret.code = 'supplier-token';
    secret.provider = SecretProvider.INLINE;
    secret.value = 'encrypted-old-value';
    secret.metadata = { owner: 'catalog' };

    const repository = {
        findOne: vi.fn(async () => secret),
        save: vi.fn(async (entity: DataHubSecret) => entity),
        remove: vi.fn(async (entity: DataHubSecret) => entity),
    };
    const connection = {
        getRepository: vi.fn(() => repository),
        getEntityOrThrow: vi.fn(async () => secret),
    };
    const secretService = {
        encryptValue: vi.fn(async (value: string) => `encrypted:${value}`),
        isConfigSecret: vi.fn(() => false),
        getSecurityMode: vi.fn(() => 'ENCRYPTED' as const),
        isCodeFirstInlineAllowed: vi.fn(() => false),
    };
    const logger = {
        error: vi.fn(),
    };
    const loggerFactory = {
        createLogger: vi.fn(() => logger),
    };
    const resolver = new DataHubSecretAdminResolver(
        connection as unknown as TransactionalConnection,
        {} as ListQueryBuilder,
        secretService as unknown as SecretService,
        loggerFactory as unknown as DataHubLoggerFactory,
    );

    return {
        resolver,
        secret,
        repository,
        secretService,
    };
}

describe('DataHubSecretAdminResolver updates', () => {
    const ctx = {} as RequestContext;

    it('retains the stored value for a metadata-only update', async () => {
        const fixture = createFixture();

        const result = await fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                metadata: { owner: 'operations' },
            },
        });

        expect(fixture.secret.value).toBe('encrypted-old-value');
        expect(fixture.secret.metadata).toEqual({ owner: 'operations' });
        expect(fixture.secretService.encryptValue).not.toHaveBeenCalled();
        expect(result.hasValue).toBe(true);
        expect(result).not.toHaveProperty('value');
    });

    it('encrypts an inline replacement exactly once', async () => {
        const fixture = createFixture();

        await fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                value: 'new-secret-value',
            },
        });

        expect(fixture.secretService.encryptValue)
            .toHaveBeenCalledOnce();
        expect(fixture.secret.value).toBe('encrypted:new-secret-value');
    });

    it('stores an ENV replacement as a variable name without encryption', async () => {
        const fixture = createFixture();

        await fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                provider: SecretProvider.ENV,
                value: 'SUPPLIER_API_TOKEN',
            },
        });

        expect(fixture.secret.provider).toBe(SecretProvider.ENV);
        expect(fixture.secret.value).toBe('SUPPLIER_API_TOKEN');
        expect(fixture.secretService.encryptValue).not.toHaveBeenCalled();
    });

    it('clears a stored value only with explicit clear intent', async () => {
        const fixture = createFixture();

        const result = await fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                clearValue: true,
            },
        });

        expect(fixture.secret.value).toBeNull();
        expect(result.hasValue).toBe(false);
        expect(result).not.toHaveProperty('value');
    });

    it.each([
        ['empty string', ''],
        ['whitespace', '   '],
        ['null', null],
    ])('rejects %s instead of treating it as clear', async (_label, value) => {
        const fixture = createFixture();

        await expect(fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                value,
            },
        })).rejects.toThrow(/must be omitted.*non-empty replacement/);

        expect(fixture.secret.value).toBe('encrypted-old-value');
        expect(fixture.repository.save).not.toHaveBeenCalled();
    });

    it('rejects simultaneous replace and clear intent', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                value: 'replacement',
                clearValue: true,
            },
        })).rejects.toThrow(/cannot be replaced and cleared/);

        expect(fixture.secret.value).toBe('encrypted-old-value');
        expect(fixture.repository.save).not.toHaveBeenCalled();
    });

    it('rejects a provider change without a replacement before mutation', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                provider: SecretProvider.ENV,
            },
        })).rejects.toThrow(/required when changing/);

        expect(fixture.secret.provider).toBe(SecretProvider.INLINE);
        expect(fixture.secret.value).toBe('encrypted-old-value');
        expect(fixture.repository.save).not.toHaveBeenCalled();
    });

    it('rejects ENV fallback syntax so plaintext fallback values are not stored', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                provider: SecretProvider.ENV,
                value: 'SUPPLIER_TOKEN|plaintext-fallback',
            },
        })).rejects.toThrow(/Environment variable names/);

        expect(fixture.secret.provider).toBe(SecretProvider.INLINE);
        expect(fixture.repository.save).not.toHaveBeenCalled();
    });

    it('requires a non-empty value when creating a secret', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.createDataHubSecret(ctx, {
            input: {
                code: 'new-secret',
                provider: SecretProvider.ENV,
            },
        })).rejects.toThrow(/non-empty value is required/);

        expect(fixture.repository.save).not.toHaveBeenCalled();
    });

    it('defaults new secrets to an ENV reference', async () => {
        const fixture = createFixture();

        await fixture.resolver.createDataHubSecret(ctx, {
            input: {
                code: 'new-secret',
                value: 'NEW_SECRET',
            },
        });

        expect(fixture.secretService.encryptValue).not.toHaveBeenCalled();
        expect(fixture.repository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'new-secret',
                provider: SecretProvider.ENV,
                value: 'NEW_SECRET',
            }),
        );
    });

    it('rejects database creation when code-first configuration owns the code', async () => {
        const fixture = createFixture();
        fixture.secretService.isConfigSecret.mockReturnValue(true);

        await expect(fixture.resolver.createDataHubSecret(ctx, {
            input: {
                code: 'supplier-token',
                provider: SecretProvider.ENV,
                value: 'SUPPLIER_TOKEN',
            },
        })).rejects.toThrow(/managed by code-first configuration/);

        expect(fixture.repository.save).not.toHaveBeenCalled();
    });

    it('rejects updates to a database row shadowed by code-first configuration', async () => {
        const fixture = createFixture();
        fixture.secretService.isConfigSecret.mockReturnValue(true);

        await expect(fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                metadata: { owner: 'operations' },
            },
        })).rejects.toThrow(/cannot be updated in the database/);

        expect(fixture.repository.save).not.toHaveBeenCalled();
    });
});
