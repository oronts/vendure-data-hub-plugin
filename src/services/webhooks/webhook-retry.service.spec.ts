import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, RequestContext } from '@vendure/core';
import { DataHubWebhookDelivery } from '../../entities/pipeline/webhook-delivery.entity';
import { calculateWebhookStats } from './webhook.helpers';
import { decryptWebhookReplayEnvelope } from './webhook-replay-envelope';
import type { WebhookDeliveryStore } from './webhook-delivery.store';
import { WebhookRetryService } from './webhook-retry.service';
import { WebhookDeliveryStatus } from './webhook.types';

interface FindOptions {
    where?: Record<string, unknown>;
    order?: Record<string, unknown>;
    take?: number;
}

interface WebhookServiceInternals {
    readonly store: WebhookDeliveryStore;
    dispatchPending(): Promise<void>;
    maintainHistory(): Promise<void>;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function createPendingDelivery(): DataHubWebhookDelivery {
    return Object.assign(new DataHubWebhookDelivery(), {
        id: 42,
        deliveryKey: 'delivery-42',
        webhookId: 'orders',
        status: WebhookDeliveryStatus.PENDING,
        availableAt: new Date(),
        dispatchToken: null,
        leaseExpiresAt: null,
    });
}

class InMemoryDeliveryRepository {
    readonly rows: DataHubWebhookDelivery[] = [];
    private nextId = 1;

    async save(entity: DataHubWebhookDelivery): Promise<DataHubWebhookDelivery> {
        entity.id = this.nextId++;
        entity.createdAt = new Date();
        entity.updatedAt = entity.createdAt;
        this.rows.push(entity);
        return entity;
    }

    async findOne(options: FindOptions): Promise<DataHubWebhookDelivery | null> {
        return this.rows.find(row => this.matches(row, options.where ?? {})) ?? null;
    }

    async find(options: FindOptions = {}): Promise<DataHubWebhookDelivery[]> {
        const matches = this.rows.filter(row => this.matches(row, options.where ?? {}));
        return options.take === undefined ? matches : matches.slice(0, options.take);
    }

    async update(
        criteria: Record<string, unknown>,
        values: Partial<DataHubWebhookDelivery>,
    ): Promise<{ affected: number }> {
        const matches = this.rows.filter(row => this.matches(row, criteria));
        for (const row of matches) Object.assign(row, values);
        return { affected: matches.length };
    }

    async delete(criteria: Record<string, unknown>): Promise<{ affected: number }> {
        const indexes = this.rows
            .map((row, index) => this.matches(row, criteria) ? index : -1)
            .filter(index => index >= 0)
            .reverse();
        for (const index of indexes) this.rows.splice(index, 1);
        return { affected: indexes.length };
    }

    private matches(
        row: DataHubWebhookDelivery,
        criteria: Record<string, unknown>,
    ): boolean {
        return Object.entries(criteria).every(([key, expected]) => {
            if (typeof expected === 'object' && expected !== null) return true;
            const actual = row[key as keyof DataHubWebhookDelivery];
            if (key === 'id') return String(actual) === String(expected);
            return actual === expected;
        });
    }
}

function createFixture(
    repository = new InMemoryDeliveryRepository(),
) {
    let processJob: ((job: Job<{ deliveryId: string; dispatchToken: string }>) => Promise<void>) | undefined;
    const add = vi.fn().mockResolvedValue(undefined);
    const resolve = vi.fn(async (_ctx: RequestContext, code: string) => {
        const values: Record<string, string> = {
            'signing-key': 'resolved-signing-value',
            'api-token': 'Bearer resolved-api-token',
        };
        return values[code] ?? null;
    });
    const publishWebhookDelivery = vi.fn();
    const service = new WebhookRetryService(
        { getRepository: vi.fn(() => repository) } as never,
        {
            create: vi.fn(async options => ({
                channelId: options.channelOrToken === 'second' ? '2' : '1',
                channel: { token: options.channelOrToken ?? 'default' },
            })),
        } as never,
        {
            createQueue: vi.fn(async options => {
                processJob = options.process;
                return { add };
            }),
        } as never,
        {
            validateSecrets: vi.fn().mockResolvedValue({ valid: true, missing: [] }),
            resolve,
        } as never,
        { createLogger: vi.fn(() => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
        })) } as never,
        { publishWebhookDelivery } as never,
    );
    service.configureSsrfProtection({ disableSsrfProtection: true });
    const ctx = {
        channelId: '1',
        channel: { token: 'default' },
    } as RequestContext;
    return {
        service,
        repository,
        add,
        resolve,
        publishWebhookDelivery,
        ctx,
        getProcessJob: () => processJob,
    };
}

describe('WebhookRetryService durable delivery', () => {
    beforeEach(() => {
        vi.stubEnv('DATAHUB_MASTER_KEY', '0123456789abcdef0123456789abcdef');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('waits for an active dispatch scan and stops before enqueueing', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        const internals = fixture.service as unknown as WebhookServiceInternals;
        const pendingDeliveries = deferred<DataHubWebhookDelivery[]>();
        vi.spyOn(internals.store, 'recoverExpiredLeases').mockResolvedValue(0);
        vi.spyOn(internals.store, 'findDue').mockReturnValue(pendingDeliveries.promise);

        const dispatch = internals.dispatchPending();
        await vi.waitFor(() => expect(internals.store.findDue).toHaveBeenCalledOnce());
        const shutdown = fixture.service.onModuleDestroy();
        pendingDeliveries.resolve([createPendingDelivery()]);
        await Promise.all([dispatch, shutdown]);

        expect(fixture.add).not.toHaveBeenCalled();
    });

    it('releases a dispatch claim acquired while shutdown begins', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        const internals = fixture.service as unknown as WebhookServiceInternals;
        const delivery = createPendingDelivery();
        const pendingClaim = deferred<boolean>();
        vi.spyOn(internals.store, 'recoverExpiredLeases').mockResolvedValue(0);
        vi.spyOn(internals.store, 'findDue').mockResolvedValue([delivery]);
        vi.spyOn(internals.store, 'claim').mockReturnValue(pendingClaim.promise);
        const releaseClaim = vi.spyOn(internals.store, 'releaseClaim').mockResolvedValue(true);

        const dispatch = internals.dispatchPending();
        await vi.waitFor(() => expect(internals.store.claim).toHaveBeenCalledOnce());
        const shutdown = fixture.service.onModuleDestroy();
        pendingClaim.resolve(true);
        await Promise.all([dispatch, shutdown]);

        expect(fixture.add).not.toHaveBeenCalled();
        expect(releaseClaim).toHaveBeenCalledWith(
            expect.anything(),
            delivery.id,
            expect.stringMatching(/^[a-f0-9]{32}$/),
        );
    });

    it('waits for active history maintenance during shutdown', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        const internals = fixture.service as unknown as WebhookServiceInternals;
        const pendingCleanup = deferred<{ delivered: number; deadLetters: number }>();
        vi.spyOn(internals.store, 'deleteExpiredHistory')
            .mockReturnValue(pendingCleanup.promise);

        const maintenance = internals.maintainHistory();
        await vi.waitFor(() => {
            expect(internals.store.deleteExpiredHistory).toHaveBeenCalledOnce();
        });
        let stopped = false;
        const shutdown = fixture.service.onModuleDestroy().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);
        pendingCleanup.resolve({ delivered: 0, deadLetters: 0 });
        await Promise.all([maintenance, shutdown]);
        expect(stopped).toBe(true);
    });

    it('persists encrypted replay data and keeps identical idempotent sends single-shot', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();

        const config = {
            id: 'orders',
            url: 'https://hooks.example.com/orders?token=url-secret',
            secretCode: 'signing-key',
            headerSecretCodes: { Authorization: 'api-token' },
        } as const;
        const first = await fixture.service.sendWebhook(
            fixture.ctx,
            config,
            { orderId: '1', privateToken: 'payload-secret' },
            { idempotencyKey: 'order-1-created' },
        );
        const second = await fixture.service.sendWebhook(
            fixture.ctx,
            config,
            { orderId: '1', privateToken: 'payload-secret' },
            { idempotencyKey: 'order-1-created' },
        );

        expect(second).toEqual(first);
        expect(fixture.repository.rows).toHaveLength(1);
        expect(fixture.add).toHaveBeenCalledOnce();
        const persisted = fixture.repository.rows[0];
        expect(persisted.encryptedReplayEnvelope).toMatch(/^enc:v1:/);
        expect(persisted.encryptedReplayEnvelope).not.toContain('payload-secret');
        expect(persisted.encryptedReplayEnvelope).not.toContain('api-token');
        expect(first).not.toHaveProperty('encryptedReplayEnvelope');
        expect(first).not.toHaveProperty('headers');
        expect(first).not.toHaveProperty('payload');
        expect(first.url).toBe('https://hooks.example.com/orders');

        const envelope = await decryptWebhookReplayEnvelope(
            persisted.encryptedReplayEnvelope,
        );
        expect(envelope.config.secretCode).toBe('signing-key');
        expect(envelope.config.headerSecretCodes).toEqual({ Authorization: 'api-token' });
        fixture.service.onModuleDestroy();
    });

    it('rejects conflicting reuse while allowing the same key in another channel', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        const config = { id: 'orders', url: 'https://hooks.example.com/orders' } as const;

        await fixture.service.sendWebhook(
            fixture.ctx,
            config,
            { orderId: '1' },
            { idempotencyKey: 'same-key' },
        );
        await expect(fixture.service.sendWebhook(
            fixture.ctx,
            config,
            { orderId: '2' },
            { idempotencyKey: 'same-key' },
        )).rejects.toThrow('Webhook idempotency key conflict');

        const secondChannel = {
            channelId: '2',
            channel: { token: 'second' },
        } as RequestContext;
        await fixture.service.sendWebhook(
            secondChannel,
            config,
            { orderId: '2' },
            { idempotencyKey: 'same-key' },
        );
        expect(fixture.repository.rows).toHaveLength(2);
        fixture.service.onModuleDestroy();
    });

    it('rejects idempotency reuse when the request contract changes', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        await fixture.service.sendWebhook(
            fixture.ctx,
            { id: 'orders', url: 'https://hooks.example.com/orders' },
            { orderId: '1' },
            { idempotencyKey: 'same-request-key' },
        );

        await expect(fixture.service.sendWebhook(
            fixture.ctx,
            { id: 'orders', url: 'https://backup.example.com/orders' },
            { orderId: '1' },
            { idempotencyKey: 'same-request-key' },
        )).rejects.toThrow('Webhook idempotency key conflict');

        expect(fixture.repository.rows).toHaveLength(1);
        expect(fixture.add).toHaveBeenCalledOnce();
        fixture.service.onModuleDestroy();
    });

    it('treats retryable status ordering as the same request contract', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        const first = await fixture.service.sendWebhook(
            fixture.ctx,
            {
                id: 'orders',
                url: 'https://hooks.example.com/orders',
                retryConfig: { retryableStatusCodes: [429, 503] },
            },
            { orderId: '1' },
            { idempotencyKey: 'status-order-key' },
        );
        const duplicate = await fixture.service.sendWebhook(
            fixture.ctx,
            {
                id: 'orders',
                url: 'https://hooks.example.com/orders',
                retryConfig: { retryableStatusCodes: [503, 429] },
            },
            { orderId: '1' },
            { idempotencyKey: 'status-order-key' },
        );

        expect(duplicate).toEqual(first);
        expect(fixture.repository.rows).toHaveLength(1);
        fixture.service.onModuleDestroy();
    });

    it('resolves Secret Codes only in the worker attempt and never stores a response body', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        await fixture.service.sendWebhook(
            fixture.ctx,
            {
                id: 'orders',
                url: 'https://hooks.example.com/orders',
                secretCode: 'signing-key',
                headerSecretCodes: { Authorization: 'api-token' },
            },
            { orderId: '1' },
            { idempotencyKey: 'delivery-1' },
        );
        expect(fixture.resolve).not.toHaveBeenCalled();

        const persisted = fixture.repository.rows[0];
        const processJob = fixture.getProcessJob();
        expect(processJob).toBeDefined();
        await processJob?.({
            data: {
                deliveryId: String(persisted.id),
                dispatchToken: persisted.dispatchToken ?? '',
            },
        } as Job<{ deliveryId: string; dispatchToken: string }>);

        expect(fixture.resolve).toHaveBeenCalledTimes(2);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        const request = vi.mocked(globalThis.fetch).mock.calls[0][1];
        const headers = new Headers(request?.headers);
        expect(headers.get('Authorization')).toBe('Bearer resolved-api-token');
        expect(headers.get('X-DataHub-Signature')).toMatch(/^sha256=/);
        expect(request?.body).toBe(JSON.stringify({ orderId: '1' }));
        expect(persisted.status).toBe(WebhookDeliveryStatus.DELIVERED);
        expect(persisted).not.toHaveProperty('responseBody');
        fixture.service.onModuleDestroy();
    });

    it('does not send after losing the dispatch lease before renewal', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        await fixture.service.sendWebhook(
            fixture.ctx,
            { id: 'orders', url: 'https://hooks.example.com/orders' },
            { orderId: '1' },
        );
        const persisted = fixture.repository.rows[0];
        vi.spyOn(fixture.repository, 'update').mockResolvedValueOnce({ affected: 0 });

        await fixture.getProcessJob()?.({
            data: {
                deliveryId: String(persisted.id),
                dispatchToken: persisted.dispatchToken ?? '',
            },
        } as Job<{ deliveryId: string; dispatchToken: string }>);

        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(fixture.publishWebhookDelivery).not.toHaveBeenCalled();
        fixture.service.onModuleDestroy();
    });

    it('does not publish delivery success after losing ownership during the request', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        await fixture.service.sendWebhook(
            fixture.ctx,
            { id: 'orders', url: 'https://hooks.example.com/orders' },
            { orderId: '1' },
        );
        const persisted = fixture.repository.rows[0];
        const update = fixture.repository.update.bind(fixture.repository);
        vi.spyOn(fixture.repository, 'update').mockImplementation(async (criteria, values) => (
            values.status === WebhookDeliveryStatus.DELIVERED
                ? { affected: 0 }
                : update(criteria, values)
        ));

        await fixture.getProcessJob()?.({
            data: {
                deliveryId: String(persisted.id),
                dispatchToken: persisted.dispatchToken ?? '',
            },
        } as Job<{ deliveryId: string; dispatchToken: string }>);

        expect(globalThis.fetch).toHaveBeenCalledOnce();
        expect(fixture.publishWebhookDelivery).not.toHaveBeenCalled();
        fixture.service.onModuleDestroy();
    });

    it('fails closed when durable replay encryption is unavailable', async () => {
        vi.stubEnv('DATAHUB_MASTER_KEY', '');
        const fixture = createFixture();
        await fixture.service.onModuleInit();

        await expect(fixture.service.sendWebhook(
            fixture.ctx,
            { id: 'orders', url: 'https://hooks.example.com/orders' },
            { orderId: '1' },
        )).rejects.toThrow('Durable webhook delivery requires DATAHUB_MASTER_KEY');
        expect(fixture.repository.rows).toHaveLength(0);
        fixture.service.onModuleDestroy();
    });
    it('retains pending work when Vendure queue publication fails', async () => {
        const fixture = createFixture();
        fixture.add.mockRejectedValueOnce(new Error('queue unavailable'));
        await fixture.service.onModuleInit();

        const delivery = await fixture.service.sendWebhook(
            fixture.ctx,
            { id: 'orders', url: 'https://hooks.example.com/orders' },
            { orderId: '1' },
        );

        const persisted = fixture.repository.rows[0];
        expect(delivery.status).toBe(WebhookDeliveryStatus.PENDING);
        expect(persisted.status).toBe(WebhookDeliveryStatus.PENDING);
        expect(persisted.dispatchToken).toBeNull();
        expect(persisted.leaseExpiresAt).toBeNull();
        expect(persisted.lastError).toBe('Webhook delivery could not be queued');
        fixture.service.onModuleDestroy();
    });

    it('dead-letters HTTP statuses excluded from retryableStatusCodes', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        await fixture.service.sendWebhook(
            fixture.ctx,
            {
                id: 'orders',
                url: 'https://hooks.example.com/orders',
                retryConfig: {
                    maxAttempts: 5,
                    retryableStatusCodes: [429, 503],
                },
            },
            { orderId: '1' },
        );

        const persisted = fixture.repository.rows[0];
        await fixture.getProcessJob()?.({
            data: {
                deliveryId: String(persisted.id),
                dispatchToken: persisted.dispatchToken ?? '',
            },
        } as Job<{ deliveryId: string; dispatchToken: string }>);

        expect(persisted.status).toBe(WebhookDeliveryStatus.DEAD_LETTER);
        expect(persisted.attempts).toBe(1);
        expect(persisted.nextRetryAt).toBeNull();
        fixture.service.onModuleDestroy();
    });

    it('persists dead letters and scopes manual recovery to the active channel', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        await fixture.service.sendWebhook(
            fixture.ctx,
            {
                id: 'orders',
                url: 'https://hooks.example.com/orders',
                retryConfig: { maxAttempts: 1 },
            },
            { orderId: '1' },
            { idempotencyKey: 'dead-letter-1' },
        );

        const persisted = fixture.repository.rows[0];
        const processJob = fixture.getProcessJob();
        await processJob?.({
            data: {
                deliveryId: String(persisted.id),
                dispatchToken: persisted.dispatchToken ?? '',
            },
        } as Job<{ deliveryId: string; dispatchToken: string }>);

        expect(persisted.status).toBe(WebhookDeliveryStatus.DEAD_LETTER);
        expect(persisted.attempts).toBe(1);
        expect(persisted.responseStatus).toBe(503);
        expect(persisted).not.toHaveProperty('responseBody');

        const otherChannel = {
            channelId: '2',
            channel: { token: 'second' },
        } as RequestContext;
        await expect(
            fixture.service.retryDeadLetter(otherChannel, 'dead-letter-1'),
        ).resolves.toBeNull();
        await expect(
            fixture.service.removeDeadLetter(otherChannel, 'dead-letter-1'),
        ).resolves.toBe(false);

        const retried = await fixture.service.retryDeadLetter(fixture.ctx, 'dead-letter-1');
        expect(retried?.status).toBe(WebhookDeliveryStatus.PENDING);
        expect(fixture.add).toHaveBeenCalledTimes(2);
        fixture.service.onModuleDestroy();
    });

    it('recovers an expired lease and redispatches after service restart', async () => {
        const repository = new InMemoryDeliveryRepository();
        const first = createFixture(repository);
        await first.service.onModuleInit();
        await first.service.sendWebhook(
            first.ctx,
            { id: 'orders', url: 'https://hooks.example.com/orders' },
            { orderId: '1' },
            { idempotencyKey: 'restart-1' },
        );
        const persisted = repository.rows[0];
        const firstToken = persisted.dispatchToken;
        persisted.leaseExpiresAt = new Date(Date.now() - 1);
        first.service.onModuleDestroy();

        const restarted = createFixture(repository);
        await restarted.service.onModuleInit();

        expect(restarted.add).toHaveBeenCalledOnce();
        expect(persisted.dispatchToken).not.toBe(firstToken);
        expect(persisted.leaseExpiresAt?.getTime()).toBeGreaterThan(Date.now());
        restarted.service.onModuleDestroy();
    });

    it('calculates public statistics from bounded grouped database counts', () => {
        const stats = calculateWebhookStats([
            { webhookId: 'orders', status: WebhookDeliveryStatus.DELIVERED, total: '4' },
            { webhookId: 'orders', status: WebhookDeliveryStatus.DEAD_LETTER, total: 2 },
            { webhookId: 'catalog', status: WebhookDeliveryStatus.RETRYING, total: '3' },
        ]);

        expect(stats).toMatchObject({
            total: 9,
            delivered: 4,
            retrying: 3,
            deadLetter: 2,
            byWebhook: {
                orders: { total: 6, delivered: 4, failed: 2 },
                catalog: { total: 3, delivered: 0, failed: 0 },
            },
        });
    });

});
