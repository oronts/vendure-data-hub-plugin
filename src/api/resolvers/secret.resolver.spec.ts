import { describe, expect, it, vi } from 'vitest';
import {
    ListQueryBuilder,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { SecretProvider } from '../../constants/enums';
import { DataHubSecret } from '../../entities/config';
import {
    SecretService,
    type SecretCodeReference,
} from '../../services/config/secret.service';
import { ResourceInUseError } from '../../services/config/resource-reference.service';
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

    const queryBuilder = {
        innerJoin: vi.fn(),
        select: vi.fn(),
        orderBy: vi.fn(),
        andWhere: vi.fn(),
        skip: vi.fn(),
        take: vi.fn(),
        getCount: vi.fn().mockResolvedValue(0),
        getMany: vi.fn().mockResolvedValue([]),
    };
    queryBuilder.innerJoin.mockReturnValue(queryBuilder);
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.skip.mockReturnValue(queryBuilder);
    queryBuilder.take.mockReturnValue(queryBuilder);
    const repository = {
        findOne: vi.fn(async () => secret),
        save: vi.fn(async (entity: DataHubSecret) => entity),
        remove: vi.fn(async (entity: DataHubSecret) => entity),
        createQueryBuilder: vi.fn(() => queryBuilder),
    };
    const connection = {
        getRepository: vi.fn(() => repository),
        getEntityOrThrow: vi.fn(async () => secret),
    };
    const listConfigReferences = vi.fn(
        (_ctx: RequestContext, _searchTerm?: string): SecretCodeReference[] => [],
    );
    const secretService = {
        encryptValue: vi.fn(async (value: string) => `encrypted:${value}`),
        isConfigSecret: vi.fn(() => false),
        getSecurityMode: vi.fn(() => 'ENCRYPTED' as const),
        isCodeFirstInlineAllowed: vi.fn(() => false),
        listConfigReferences,
        getById: vi.fn(async () => repository.findOne()),
    };
    const logger = {
        error: vi.fn(),
    };
    const loggerFactory = {
        createLogger: vi.fn(() => logger),
    };
    const resourceReferences = {
        assertSecretMutable: vi.fn(),
        assertSecretUnassignable: vi.fn(),
    };
    const managedResourceChannels = {
        assignToCurrentChannel: vi.fn(async (_ctx, value) => value),
        prepareDelete: vi.fn(async () => ({
            entity: secret,
            physicallyDelete: true,
        })),
        removeFromActiveChannel: vi.fn(),
    };
    const resolver = new DataHubSecretAdminResolver(
        connection as unknown as TransactionalConnection,
        {} as ListQueryBuilder,
        secretService as unknown as SecretService,
        resourceReferences as never,
        loggerFactory as unknown as DataHubLoggerFactory,
        managedResourceChannels as never,
    );

    return {
        resolver,
        secret,
        repository,
        secretService,
        resourceReferences,
        logger,
        queryBuilder,
        managedResourceChannels,
    };
}

describe('DataHubSecretAdminResolver references', () => {
    const ctx = {} as RequestContext;

    it('paginates code-first entries before distinct database entries', async () => {
        const fixture = createFixture();
        const configReferences = [
            { code: 'pimcore-api-key', provider: 'ENV', source: 'config' as const },
            { code: 'webhook-token', provider: 'INLINE', source: 'config' as const },
        ];
        fixture.secretService.listConfigReferences.mockImplementation(
            (_ctx, search = '') => configReferences.filter(reference =>
                reference.code.includes(search.toLowerCase()),
            ),
        );
        fixture.queryBuilder.getCount.mockResolvedValue(2);
        fixture.queryBuilder.getMany.mockResolvedValue([
            Object.assign(new DataHubSecret(), {
                code: 'pimcore-db-token',
                provider: SecretProvider.ENV,
            }),
        ]);

        const result = await fixture.resolver.dataHubSecretReferences(ctx, {
            search: 'PIMCORE',
            skip: 0,
            take: 2,
        });

        expect(result).toEqual({
            items: [
                { code: 'pimcore-api-key', provider: 'ENV', source: 'config' },
                { code: 'pimcore-db-token', provider: 'ENV', source: 'database' },
            ],
            totalItems: 3,
        });
        expect(fixture.queryBuilder.andWhere).toHaveBeenCalledWith(
            'LOWER(secret.code) LIKE :secretSearch',
            { secretSearch: '%pimcore%' },
        );
        expect(fixture.queryBuilder.andWhere).toHaveBeenCalledWith(
            'secret.code NOT IN (:...configSecretCodes)',
            { configSecretCodes: ['pimcore-api-key', 'webhook-token'] },
        );
        expect(fixture.queryBuilder.skip).toHaveBeenCalledWith(0);
        expect(fixture.queryBuilder.take).toHaveBeenCalledWith(1);
    });

    it('rejects unbounded reference requests', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.dataHubSecretReferences(ctx, {
            skip: 0,
            take: 101,
        })).rejects.toThrow('between 1 and 100');
        expect(fixture.repository.createQueryBuilder).not.toHaveBeenCalled();
    });
});

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

    it('blocks renaming a secret that has persisted references', async () => {
        const fixture = createFixture();
        fixture.resourceReferences.assertSecretMutable.mockRejectedValue(
            new ResourceInUseError('Secret is used by pipeline supplier-import'),
        );

        await expect(fixture.resolver.updateDataHubSecret(ctx, {
            input: {
                id: fixture.secret.id,
                code: 'renamed-token',
            },
        })).rejects.toThrow('Secret is used by pipeline supplier-import');

        expect(fixture.repository.save).not.toHaveBeenCalled();
    });

    it('blocks deleting a secret that has persisted references', async () => {
        const fixture = createFixture();
        fixture.resourceReferences.assertSecretMutable.mockRejectedValue(
            new ResourceInUseError('Secret is used by pipeline supplier-import'),
        );

        const result = await fixture.resolver.deleteDataHubSecret(ctx, {
            id: fixture.secret.id,
        });

        expect(result).toEqual({
            result: 'NOT_DELETED',
            message: 'Secret is used by pipeline supplier-import',
        });
        expect(fixture.logger.error).not.toHaveBeenCalled();
        expect(fixture.repository.remove).not.toHaveBeenCalled();
    });

    it('hides internal deletion errors and records the failure', async () => {
        const fixture = createFixture();
        fixture.resourceReferences.assertSecretMutable.mockRejectedValue(
            new Error('database unavailable'),
        );

        const result = await fixture.resolver.deleteDataHubSecret(ctx, {
            id: fixture.secret.id,
        });

        expect(result).toEqual({
            result: 'NOT_DELETED',
            message: 'Failed to delete secret due to an internal error',
        });
        expect(fixture.logger.error).toHaveBeenCalledWith(
            'Failed to delete secret: database unavailable',
        );
        expect(fixture.repository.remove).not.toHaveBeenCalled();
    });

    it('returns an actionable deletion response when the secret does not exist', async () => {
        const fixture = createFixture();
        fixture.repository.findOne.mockResolvedValueOnce(null as never);

        const result = await fixture.resolver.deleteDataHubSecret(ctx, { id: 999 });

        expect(result).toEqual({
            result: 'NOT_DELETED',
            message: 'Secret not found',
        });
        expect(fixture.resourceReferences.assertSecretMutable).not.toHaveBeenCalled();
        expect(fixture.repository.remove).not.toHaveBeenCalled();
    });
});
