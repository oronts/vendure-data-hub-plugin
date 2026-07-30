import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionAuthType } from '../../constants';
import { DataHubExportDestination } from '../../entities/config';
import { secureFetch } from '../../utils/secure-fetch.utils';
import type { SecretService } from '../config/secret.service';
import type { DataHubLoggerFactory } from '../logger';
import type { DistributedLockService } from '../runtime/distributed-lock.service';
import { ExportDestinationService } from './export-destination.service';
import { DESTINATION_TEST_REGISTRY } from './destination-handler-registry';

vi.mock('../../utils/secure-fetch.utils', () => ({
    secureFetch: vi.fn(),
}));

const ctx = { channelId: 'channel-a' } as RequestContext;
const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};
const loggerFactory = {
    createLogger: vi.fn(() => logger),
} as unknown as DataHubLoggerFactory;

interface DestinationStore {
    readonly rows: DataHubExportDestination[];
    nextId: number;
}

interface DestinationWhere {
    channelId?: string;
    destinationId?: string;
}

function matchesWhere(
    row: DataHubExportDestination,
    where: DestinationWhere,
): boolean {
    return (where.channelId === undefined || row.channelId === where.channelId)
        && (where.destinationId === undefined || row.destinationId === where.destinationId);
}

function createPersistence(store: DestinationStore = { rows: [], nextId: 1 }) {
    const repository = {
        findOne: vi.fn(async (options: { where: DestinationWhere }) =>
            store.rows.find(row => matchesWhere(row, options.where)) ?? null),
        find: vi.fn(async (options: { where: DestinationWhere }) =>
            store.rows
                .filter(row => matchesWhere(row, options.where))
                .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())),
        count: vi.fn(async (options: { where: DestinationWhere }) =>
            store.rows.filter(row => matchesWhere(row, options.where)).length),
        save: vi.fn(async (entity: DataHubExportDestination) => {
            const existingIndex = store.rows.findIndex(row =>
                row.channelId === entity.channelId
                && row.destinationId === entity.destinationId);
            const timestamp = new Date(store.nextId * 1_000);
            entity.id ??= store.nextId++;
            entity.createdAt ??= timestamp;
            entity.updatedAt = timestamp;
            if (existingIndex === -1) {
                store.rows.push(entity);
            } else {
                store.rows[existingIndex] = entity;
            }
            return entity;
        }),
        remove: vi.fn(async (entity: DataHubExportDestination) => {
            const existingIndex = store.rows.indexOf(entity);
            if (existingIndex >= 0) store.rows.splice(existingIndex, 1);
            return entity;
        }),
    };
    const connection = {
        getRepository: vi.fn(() => repository),
        withTransaction: vi.fn(async (
            transactionCtx: RequestContext,
            action: (ctx: RequestContext) => Promise<unknown>,
        ) => action(transactionCtx)),
    } as unknown as TransactionalConnection;
    return { connection, repository, store };
}

type Persistence = ReturnType<typeof createPersistence>;

function createService(
    values: Record<string, string | null> = {},
    persistence: Persistence = createPersistence(),
) {
    const secretService = {
        validateSecrets: vi.fn(async (_ctx: RequestContext, codes: string[]) => ({
            valid: codes.every(code => values[code] !== undefined),
            missing: codes.filter(code => values[code] === undefined),
        })),
        resolve: vi.fn(async (_ctx: RequestContext, code: string) => values[code] ?? null),
    } as unknown as SecretService;
    let pending = Promise.resolve();
    const distributedLock = {
        withLock: vi.fn((
            _key: string,
            action: () => Promise<unknown>,
        ) => {
            const result = pending.then(action);
            pending = result.then(() => undefined, () => undefined);
            return result;
        }),
    } as unknown as DistributedLockService;
    return {
        service: new ExportDestinationService(
            persistence.connection,
            secretService,
            distributedLock,
            loggerFactory,
        ),
        secretService,
        distributedLock,
        ...persistence,
    };
}

describe('ExportDestinationService credential security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores and returns only Secret Code references', async () => {
        const { service, store } = createService({ 'partner-token': 'runtime-token' });
        await service.registerDestination(ctx, {
            id: 'partner',
            name: 'Partner',
            type: 'HTTP',
            url: 'https://partner.example.com/import',
            auth: {
                type: ConnectionAuthType.BEARER,
                secretCode: 'partner-token',
            },
        });

        const stored = await service.getDestination(ctx, 'partner');
        expect(stored).toMatchObject({
            enabled: true,
            auth: {
                type: ConnectionAuthType.BEARER,
                secretCode: 'partner-token',
            },
        });
        expect(JSON.stringify(stored)).not.toContain('runtime-token');
        expect(JSON.stringify(store.rows[0]?.config)).toContain('partner-token');
        expect(JSON.stringify(store.rows[0]?.config)).not.toContain('runtime-token');
        expect(stored).not.toHaveProperty('authConfig');
    });

    it('resolves credentials only for delivery and never persists the value', async () => {
        const response = new Response('accepted', { status: 200 });
        const cancelBody = vi.spyOn(response.body!, 'cancel');
        vi.mocked(secureFetch).mockResolvedValue(response);
        const { service, secretService } = createService({
            'partner-token': 'runtime-token',
        });
        await service.registerDestination(ctx, {
            id: 'partner',
            name: 'Partner',
            type: 'HTTP',
            url: 'https://partner.example.com/import',
            auth: {
                type: ConnectionAuthType.BEARER,
                secretCode: 'partner-token',
            },
        });

        const result = await service.deliver(
            ctx,
            'partner',
            'catalog',
            'catalog.csv',
        );

        expect(result.success).toBe(true);
        expect(secretService.resolve).toHaveBeenCalledWith(ctx, 'partner-token');
        const request = vi.mocked(secureFetch).mock.calls[0]?.[1];
        expect(request?.headers).toMatchObject({
            Authorization: 'Bearer runtime-token',
        });
        expect(cancelBody).toHaveBeenCalledOnce();
        expect(JSON.stringify(await service.getDestination(ctx, 'partner'))).not.toContain(
            'runtime-token',
        );
    });

    it('delivers inline HTTP exports with secret-backed headers without registration', async () => {
        vi.mocked(secureFetch).mockResolvedValue(new Response(null, { status: 202 }));
        const { service, secretService } = createService({
            'partner-token': 'runtime-token',
        });

        const result = await service.deliverConfigured(
            ctx,
            {
                id: 'pipeline:partner-export',
                name: 'Partner export',
                type: 'HTTP',
                url: 'https://partner.example.com/import',
                headers: { 'X-Tenant': 'catalog' },
                headerSecretCodes: { Authorization: 'partner-token' },
            },
            'sku\nSKU-1',
            'catalog.csv',
            { mimeType: 'text/csv' },
        );

        expect(result).toMatchObject({
            success: true,
            destinationType: 'HTTP',
            filename: 'catalog.csv',
        });
        await expect(service.getDestination(ctx, 'pipeline:partner-export')).resolves.toBeUndefined();
        expect(secretService.resolve).toHaveBeenCalledWith(ctx, 'partner-token');
        expect(vi.mocked(secureFetch).mock.calls[0]?.[1]?.headers).toMatchObject({
            Authorization: 'runtime-token',
            'X-Tenant': 'catalog',
            'Content-Type': 'text/csv',
        });
    });

    it('does not deliver a disabled inline destination', async () => {
        const { service, secretService } = createService({
            'partner-token': 'runtime-token',
        });

        const result = await service.deliverConfigured(
            ctx,
            {
                id: 'pipeline:disabled-export',
                name: 'Disabled export',
                type: 'HTTP',
                enabled: false,
                url: 'https://partner.example.com/import',
                headerSecretCodes: { Authorization: 'partner-token' },
            },
            'sku\nSKU-1',
            'catalog.csv',
        );

        expect(result).toEqual({
            success: false,
            destinationId: 'pipeline:disabled-export',
            destinationType: 'HTTP',
            filename: 'catalog.csv',
            size: 0,
            error: 'Destination is disabled: pipeline:disabled-export',
        });
        expect(secretService.validateSecrets).not.toHaveBeenCalled();
        expect(secretService.resolve).not.toHaveBeenCalled();
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it('rejects unavailable Secret Codes before registration', async () => {
        const { service } = createService();
        await expect(service.registerDestination(ctx, {
            id: 'ftp',
            name: 'FTP',
            type: 'FTP',
            host: 'ftp.example.com',
            username: 'catalog',
            passwordSecretCode: 'ftp-password',
            remotePath: '/exports',
        })).rejects.toThrow('unavailable Secret Codes: ftp-password');
        await expect(service.getDestination(ctx, 'ftp')).resolves.toBeUndefined();
    });

    it('fails closed if a registered secret becomes unavailable', async () => {
        const values: Record<string, string | null> = {
            'partner-token': 'runtime-token',
        };
        const { service } = createService(values);
        await service.registerDestination(ctx, {
            id: 'partner',
            name: 'Partner',
            type: 'HTTP',
            url: 'https://partner.example.com/import',
            auth: {
                type: ConnectionAuthType.BEARER,
                secretCode: 'partner-token',
            },
        });
        values['partner-token'] = null;

        const result = await service.deliver(
            ctx,
            'partner',
            'catalog',
            'catalog.csv',
        );

        expect(result).toMatchObject({
            success: false,
            error: expect.stringContaining('empty or unavailable'),
        });
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it('resolves an SFTP host fingerprint only for connectivity operations', async () => {
        const fingerprint = 'SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const { service, secretService } = createService({
            'sftp-private-key': 'runtime-private-key',
            'sftp-host-key': fingerprint,
        });
        await service.registerDestination(ctx, {
            id: 'sftp',
            name: 'SFTP',
            type: 'SFTP',
            host: 'sftp.example.com',
            username: 'catalog',
            privateKeySecretCode: 'sftp-private-key',
            hostKeyFingerprintSecretCode: 'sftp-host-key',
            remotePath: '/exports',
        });
        const stored = await service.getDestination(ctx, 'sftp');
        expect(stored).toMatchObject({
            hostKeyFingerprintSecretCode: 'sftp-host-key',
        });
        expect(JSON.stringify(stored)).not.toContain(fingerprint);
        const testHandler = vi.fn(async config => {
            expect(config).toMatchObject({
                privateKey: 'runtime-private-key',
                hostKeyFingerprint: fingerprint,
            });
            return { success: true, message: 'connected' };
        });
        vi.spyOn(DESTINATION_TEST_REGISTRY, 'get').mockReturnValue(testHandler);

        await expect(service.testDestination(ctx, 'sftp')).resolves.toMatchObject({
            success: true,
        });
        expect(secretService.resolve).toHaveBeenCalledWith(ctx, 'sftp-host-key');
    });

    it('rejects capacity overflow without evicting an existing destination', async () => {
        const { service } = createService();
        for (let index = 0; index < 100; index++) {
            await service.registerDestination(ctx, {
                id: `local-${index}`,
                name: `Local ${index}`,
                type: 'LOCAL',
                directory: `exports/${index}`,
            });
        }

        await expect(service.registerDestination(ctx, {
            id: 'overflow',
            name: 'Overflow',
            type: 'LOCAL',
            directory: 'exports/overflow',
        })).rejects.toThrow('Export destination limit reached (100)');
        await expect(service.getDestination(ctx, 'local-0')).resolves.toBeDefined();
        await expect(service.getDestination(ctx, 'overflow')).resolves.toBeUndefined();
    });

    it('serializes concurrent registrations before enforcing channel capacity', async () => {
        const { service, store, distributedLock } = createService();
        for (let index = 0; index < 99; index++) {
            await service.registerDestination(ctx, {
                id: `existing-${index}`,
                name: `Existing ${index}`,
                type: 'LOCAL',
                directory: `exports/existing-${index}`,
            });
        }

        const results = await Promise.allSettled([
            service.registerDestination(ctx, {
                id: 'concurrent-a',
                name: 'Concurrent A',
                type: 'LOCAL',
                directory: 'exports/concurrent-a',
            }),
            service.registerDestination(ctx, {
                id: 'concurrent-b',
                name: 'Concurrent B',
                type: 'LOCAL',
                directory: 'exports/concurrent-b',
            }),
        ]);

        expect(results.map(result => result.status).sort()).toEqual([
            'fulfilled',
            'rejected',
        ]);
        expect(store.rows).toHaveLength(100);
        expect(distributedLock.withLock).toHaveBeenLastCalledWith(
            'export-destination-lifecycle:channel-a',
            expect.any(Function),
            expect.objectContaining({ waitForLock: true }),
        );
    });

    it('retains definitions across service reconstruction without a process cache', async () => {
        const persistence = createPersistence();
        const first = createService({}, persistence).service;
        const reconstructed = createService({}, persistence).service;

        await expect(
            reconstructed.getDestination(ctx, 'durable'),
        ).resolves.toBeUndefined();

        await first.registerDestination(ctx, {
            id: 'durable',
            name: 'Durable export',
            type: 'LOCAL',
            directory: 'exports/durable',
        });

        await expect(
            reconstructed.getDestination(ctx, 'durable'),
        ).resolves.toMatchObject({
            id: 'durable',
            directory: 'exports/durable',
            enabled: true,
        });
    });

    it('isolates destination identifiers and listings by channel', async () => {
        const persistence = createPersistence();
        const service = createService({}, persistence).service;
        const otherCtx = { channelId: 'channel-b' } as RequestContext;

        await service.registerDestination(ctx, {
            id: 'shared',
            name: 'Channel A',
            type: 'LOCAL',
            directory: 'exports/a',
        });
        await service.registerDestination(otherCtx, {
            id: 'shared',
            name: 'Channel B',
            type: 'LOCAL',
            directory: 'exports/b',
        });

        await expect(service.getDestination(ctx, 'shared')).resolves.toMatchObject({
            directory: 'exports/a',
        });
        await expect(
            service.getDestination(otherCtx, 'shared'),
        ).resolves.toMatchObject({
            directory: 'exports/b',
        });
        await expect(service.getDestinations(ctx)).resolves.toHaveLength(1);
        await expect(service.getDestinations(otherCtx)).resolves.toHaveLength(1);
        expect(persistence.store.rows).toHaveLength(2);
    });

    it('deletes only the destination in the active channel', async () => {
        const persistence = createPersistence();
        const { service, repository, distributedLock } = createService({}, persistence);
        const otherCtx = { channelId: 'channel-b' } as RequestContext;
        await service.registerDestination(ctx, {
            id: 'shared',
            name: 'Channel A',
            type: 'LOCAL',
            directory: 'exports/a',
        });
        await service.registerDestination(otherCtx, {
            id: 'shared',
            name: 'Channel B',
            type: 'LOCAL',
            directory: 'exports/b',
        });

        await expect(service.deleteDestination(ctx, 'shared')).resolves.toBe(true);
        await expect(service.getDestination(ctx, 'shared')).resolves.toBeUndefined();
        await expect(service.getDestination(otherCtx, 'shared')).resolves.toMatchObject({
            directory: 'exports/b',
        });
        expect(repository.remove).toHaveBeenCalledTimes(1);
        expect(distributedLock.withLock).toHaveBeenLastCalledWith(
            'export-destination-lifecycle:channel-a',
            expect.any(Function),
            expect.objectContaining({ waitForLock: true }),
        );
    });

    it('returns false when deleting a missing channel destination', async () => {
        const { service, repository } = createService();

        await expect(service.deleteDestination(ctx, 'missing')).resolves.toBe(false);
        expect(repository.remove).not.toHaveBeenCalled();
    });

    it('updates a channel destination in place', async () => {
        const persistence = createPersistence();
        const service = createService({}, persistence).service;

        await service.registerDestination(ctx, {
            id: 'replace-me',
            name: 'Original',
            type: 'LOCAL',
            directory: 'exports/original',
        });
        await service.registerDestination(ctx, {
            id: 'replace-me',
            name: 'Updated',
            type: 'LOCAL',
            directory: 'exports/updated',
            enabled: false,
        });

        expect(persistence.store.rows).toHaveLength(1);
        await expect(
            service.getDestination(ctx, 'replace-me'),
        ).resolves.toMatchObject({
            name: 'Updated',
            directory: 'exports/updated',
            enabled: false,
        });
    });

    it('rejects duplicate managed destination creation without overwriting', async () => {
        const persistence = createPersistence();
        const service = createService({}, persistence).service;

        await service.createDestination(ctx, {
            id: 'managed',
            name: 'Original',
            type: 'LOCAL',
            directory: 'exports/original',
        });

        await expect(service.createDestination(ctx, {
            id: 'managed',
            name: 'Replacement',
            type: 'LOCAL',
            directory: 'exports/replacement',
        })).rejects.toThrow(
            'Export destination "managed" already exists in the active channel',
        );
        await expect(service.getDestination(ctx, 'managed')).resolves.toMatchObject({
            name: 'Original',
            directory: 'exports/original',
        });
    });

    it('fails closed when persisted identity metadata is inconsistent', async () => {
        const { service, store } = createService();
        await service.registerDestination(ctx, {
            id: 'guarded',
            name: 'Guarded',
            type: 'LOCAL',
            directory: 'exports/guarded',
        });
        store.rows[0]!.destinationId = 'different-id';

        await expect(
            service.getDestinations(ctx),
        ).rejects.toThrow('Stored export destination "different-id" is inconsistent');
    });

    it('rejects operations without an active channel', async () => {
        const { service } = createService();
        const missingChannelCtx = {} as RequestContext;
        const emptyChannelCtx = { channelId: '   ' } as RequestContext;

        await expect(service.getDestinations(missingChannelCtx)).rejects.toThrow(
            'require an active channel',
        );
        await expect(service.registerDestination(missingChannelCtx, {
            id: 'unscoped',
            name: 'Unscoped',
            type: 'LOCAL',
            directory: 'exports/unscoped',
        })).rejects.toThrow('require an active channel');
        await expect(
            service.deleteDestination(missingChannelCtx, 'unscoped'),
        ).rejects.toThrow('require an active channel');
        await expect(service.getDestinations(emptyChannelCtx)).rejects.toThrow(
            'require an active channel',
        );
    });
});
