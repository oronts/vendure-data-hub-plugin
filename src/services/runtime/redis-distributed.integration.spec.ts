import * as crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createServer, connect, type Server, type Socket } from 'node:net';
import { promisify } from 'node:util';
import Redis from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DataHubLogger } from '../logger';
import { RateLimitBackendUnavailableError, RateLimitService } from '../rate-limit';
import { RedisRateLimitBackend } from '../rate-limit/redis-rate-limit.backend';
import { RedisLockBackend } from './lock-backends/redis-lock.backend';

const execFileAsync = promisify(execFile);
const redisUrl = process.env.DATAHUB_REDIS_INTEGRATION_URL?.trim();
const integrationDescribe = redisUrl ? describe : describe.skip;
const trackedRateLimitKeys = new Set<string>();
const CHILD_PROCESS_TIMEOUT_MS = 45_000;
const PROCESS_BARRIER_TIMEOUT_MS = 30_000;
const CHILD_READY_SIGNAL = '__DATAHUB_READY__\n';

const childProcessScript = String.raw`
const logger = { debug() {}, info() {}, warn() {}, error() {} };

async function waitAtBarrier() {
    process.stdout.write('__DATAHUB_READY__\n');
    await new Promise((resolve, reject) => {
        let input = '';
        process.stdin.setEncoding('utf8');
        process.stdin.once('error', reject);
        process.stdin.on('data', chunk => {
            input += chunk;
            if (input.includes('go\n')) {
                resolve();
            }
        });
    });
}

function streamConfig(url, consumerGroup, consumerName) {
    const parsed = new URL(url);
    const database = parsed.pathname.slice(1);
    return {
        host: parsed.hostname,
        port: Number(parsed.port || 6379),
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        db: database ? Number(database) : 0,
        consumerGroup,
        consumerName,
    };
}

async function main() {
    const input = JSON.parse(process.argv[1]);
    if (!input.processBarrier) {
        const waitMs = Math.max(0, input.startAt - Date.now());
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    if (input.mode === 'webhook-rate') {
        const { RateLimitService } = require('./src/services/rate-limit/rate-limit.service.ts');
        process.env.DATAHUB_REDIS_URL = input.url;
        delete process.env.REDIS_URL;
        const service = new RateLimitService({ createLogger: () => logger });
        await service.onModuleInit();
        try {
            const results = [];
            for (let index = 0; index < input.iterations; index++) {
                results.push(await service.isRateLimited(
                    input.key,
                    input.maxRequests,
                    input.windowMs,
                ));
            }
            process.stdout.write(JSON.stringify(results));
        } finally {
            await service.onModuleDestroy();
        }
        return;
    }

    if (input.mode.startsWith('stream-')) {
        const { AckMode } = require('./src/constants/enums.ts');
        const { RedisStreamsAdapter } = require('./src/sdk/adapters/queue/redis-streams.adapter.ts');
        const { configureGlobalSsrfProtection } = require('./src/utils/url-security.utils.ts');
        const trustedHost = new URL(input.url).hostname;
        configureGlobalSsrfProtection({ allowedHostnames: [trustedHost] });
        const adapter = new RedisStreamsAdapter();
        const config = streamConfig(
            input.url,
            input.consumerGroup,
            input.consumerName,
        );
        try {
            if (input.mode === 'stream-publish') {
                const results = await adapter.publish(
                    config,
                    input.queueName,
                    input.messages,
                );
                process.stdout.write(JSON.stringify(results));
                return;
            }
            if (input.mode === 'stream-consume') {
                const results = await adapter.consume(config, input.queueName, {
                    count: input.count,
                    ackMode: AckMode.AUTO,
                });
                process.stdout.write(JSON.stringify(results));
                return;
            }
            if (input.mode === 'stream-abandon') {
                const results = await adapter.consume(config, input.queueName, {
                    count: 1,
                    ackMode: AckMode.MANUAL,
                });
                process.stdout.write(JSON.stringify(results));
                return;
            }
            const results = await adapter.claimStaleMessages(
                config,
                input.queueName,
                0,
                input.count,
            );
            for (const result of results) {
                if (result.deliveryTag) await adapter.ack(config, result.deliveryTag);
            }
            process.stdout.write(JSON.stringify(results));
        } finally {
            await adapter.destroy();
            configureGlobalSsrfProtection(undefined);
        }
        return;
    }

    if (input.mode === 'rate') {
        const { RedisRateLimitBackend } = require('./src/services/rate-limit/redis-rate-limit.backend.ts');
        const backend = await RedisRateLimitBackend.create(input.url, logger);
        try {
            const results = [];
            for (let index = 0; index < input.iterations; index++) {
                results.push(await backend.increment(input.key, input.windowMs));
            }
            process.stdout.write(JSON.stringify(results));
        } finally {
            await backend.close();
        }
        return;
    }

    const { RedisLockBackend } = require('./src/services/runtime/lock-backends/redis-lock.backend.ts');
    const backend = await RedisLockBackend.create(input.url, logger);
    try {
        if (input.processBarrier) await waitAtBarrier();
        const acquired = await backend.acquire(input.key, input.owner, input.ttlMs);
        if (acquired) {
            await new Promise(resolve => setTimeout(resolve, input.holdMs));
            await backend.release(input.key, input.owner);
        }
        process.stdout.write(JSON.stringify({ acquired }));
    } finally {
        await backend.close();
    }
}

main().catch(error => {
    process.stderr.write(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
});
`;

function createLogger(): DataHubLogger {
    return {
        debug() {},
        info() {},
        warn() {},
        error() {},
    } as unknown as DataHubLogger;
}

function uniqueKey(scope: string): string {
    return `integration:${scope}:${process.pid}:${Date.now()}:${Math.random()}`;
}

function redisRateLimitKey(key: string): string {
    const digest = crypto.createHash('sha256').update(key).digest('hex');
    return `datahub:rate-limit:v1:${digest}`;
}

async function createRedisProxy(targetUrl: string): Promise<{
    readonly url: string;
    pause(): void;
    resume(): void;
    close(): Promise<void>;
}> {
    const target = new URL(targetUrl);
    const sockets = new Set<Socket>();
    let acceptingConnections = true;
    const server: Server = createServer(client => {
        sockets.add(client);
        if (!acceptingConnections) {
            client.destroy();
            return;
        }
        const upstream = connect(Number(target.port || 6379), target.hostname);
        sockets.add(upstream);
        client.pipe(upstream).pipe(client);
        const forget = (): void => {
            sockets.delete(client);
            sockets.delete(upstream);
        };
        client.once('close', forget);
        upstream.once('close', forget);
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Redis test proxy did not bind to a TCP port');
    }
    const proxyUrl = new URL(targetUrl);
    proxyUrl.hostname = '127.0.0.1';
    proxyUrl.port = String(address.port);

    return {
        url: proxyUrl.toString(),
        pause(): void {
            acceptingConnections = false;
            for (const socket of sockets) socket.destroy();
        },
        resume(): void {
            acceptingConnections = true;
        },
        async close(): Promise<void> {
            acceptingConnections = false;
            for (const socket of sockets) socket.destroy();
            await new Promise<void>(resolve => server.close(() => resolve()));
        },
    };
}

async function runChild<T>(input: Record<string, unknown>): Promise<T> {
    const { stdout } = await execFileAsync(
        process.execPath,
        [
            '--import',
            'tsx',
            '-e',
            childProcessScript,
            JSON.stringify(input),
        ],
        {
            cwd: process.cwd(),
            timeout: CHILD_PROCESS_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
        },
    );
    return JSON.parse(stdout) as T;
}

interface BarrierChild<T> {
    readonly ready: Promise<void>;
    readonly result: Promise<T>;
    release(): void;
    terminate(): void;
}

function startBarrierChild<T>(input: Record<string, unknown>): BarrierChild<T> {
    const child = spawn(
        process.execPath,
        ['--import', 'tsx', '-e', childProcessScript, JSON.stringify(input)],
        { cwd: process.cwd(), stdio: 'pipe' },
    );
    let stdout = '';
    let stderr = '';
    let readyObserved = false;
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    const result = new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
            const error = new Error('Redis lock contender timed out');
            rejectReady(error);
            child.kill();
            reject(error);
        }, CHILD_PROCESS_TIMEOUT_MS);

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => {
            stdout += chunk;
            if (!readyObserved && stdout.includes(CHILD_READY_SIGNAL)) {
                readyObserved = true;
                resolveReady();
            }
        });
        child.stderr.on('data', chunk => {
            stderr += chunk;
        });
        child.once('error', error => {
            clearTimeout(timeout);
            rejectReady(error);
            reject(error);
        });
        child.once('close', code => {
            clearTimeout(timeout);
            if (code !== 0) {
                const error = new Error(stderr.trim() || `Redis lock contender exited with code ${String(code)}`);
                rejectReady(error);
                reject(error);
                return;
            }
            if (!readyObserved) {
                const error = new Error('Redis lock contender exited before becoming ready');
                rejectReady(error);
                reject(error);
                return;
            }
            try {
                resolve(JSON.parse(stdout.replace(CHILD_READY_SIGNAL, '').trim()) as T);
            } catch (error) {
                reject(error);
            }
        });
    });
    void result.catch(() => undefined);

    return {
        ready,
        result,
        release: () => child.stdin.end('go\n'),
        terminate: () => {
            if (child.exitCode === null) child.kill();
        },
    };
}

integrationDescribe('Redis distributed integration', () => {
    let rateLimitBackend: RedisRateLimitBackend;
    let firstLockBackend: RedisLockBackend;
    let secondLockBackend: RedisLockBackend;

    beforeAll(async () => {
        rateLimitBackend = await RedisRateLimitBackend.create(redisUrl!, createLogger());
        firstLockBackend = await RedisLockBackend.create(redisUrl!, createLogger());
        secondLockBackend = await RedisLockBackend.create(redisUrl!, createLogger());
    });

    afterEach(async () => {
        await Promise.all(
            Array.from(trackedRateLimitKeys, key => rateLimitBackend.reset(key)),
        );
        trackedRateLimitKeys.clear();
    });

    afterAll(async () => {
        await Promise.all([
            rateLimitBackend?.close(),
            firstLockBackend?.close(),
            secondLockBackend?.close(),
        ]);
    });

    it('maintains atomic, scoped counters across independent Node processes', async () => {
        const sharedKey = uniqueKey('rate-shared');
        const isolatedKey = uniqueKey('rate-isolated');
        trackedRateLimitKeys.add(sharedKey);
        trackedRateLimitKeys.add(isolatedKey);
        const startAt = Date.now() + 4_000;
        const windowMs = 30_000;

        const [sharedResults, isolatedResults] = await Promise.all([
            Promise.all(Array.from({ length: 6 }, () => runChild<Array<{
                count: number;
                ttlMs: number;
            }>>({
                mode: 'rate',
                url: redisUrl,
                key: sharedKey,
                iterations: 20,
                windowMs,
                startAt,
            }))),
            Promise.all(Array.from({ length: 3 }, () => runChild<Array<{
                count: number;
                ttlMs: number;
            }>>({
                mode: 'rate',
                url: redisUrl,
                key: isolatedKey,
                iterations: 7,
                windowMs,
                startAt,
            }))),
        ]);

        const shared = sharedResults.flat();
        const isolated = isolatedResults.flat();
        expect(shared.map(result => result.count).sort((a, b) => a - b))
            .toEqual(Array.from({ length: 120 }, (_, index) => index + 1));
        expect(isolated.map(result => result.count).sort((a, b) => a - b))
            .toEqual(Array.from({ length: 21 }, (_, index) => index + 1));
        expect(shared.every(result => result.ttlMs > 0 && result.ttlMs <= windowMs))
            .toBe(true);
        await expect(rateLimitBackend.getCount(sharedKey)).resolves.toBe(120);
        await expect(rateLimitBackend.getCount(isolatedKey)).resolves.toBe(21);
    }, 30_000);

    it('enforces one webhook quota across independent service replicas', async () => {
        const pipelineCode = uniqueKey('webhook-quota');
        const ip = '203.0.113.42';
        const rateLimitKey = 'ip:' + ip + ':pipeline:' + pipelineCode;
        trackedRateLimitKeys.add(rateLimitKey);
        const startAt = Date.now() + 3_000;
        const maxRequests = 25;
        const iterations = 15;

        const replicaResults = await Promise.all(
            Array.from({ length: 4 }, () => runChild<Array<{
                limited: boolean;
                resetAt: number;
                retryAfter: number;
            }>>({
                mode: 'webhook-rate',
                url: redisUrl,
                key: { pipelineCode, ip },
                maxRequests,
                windowMs: 30_000,
                iterations,
                startAt,
            })),
        );
        const results = replicaResults.flat();

        expect(results).toHaveLength(60);
        expect(results.filter(result => !result.limited)).toHaveLength(maxRequests);
        expect(results.filter(result => result.limited)).toHaveLength(
            results.length - maxRequests,
        );
        expect(results.filter(result => result.limited).every(
            result => result.retryAfter > 0,
        )).toBe(true);
        await expect(rateLimitBackend.getCount(rateLimitKey)).resolves.toBe(60);
    }, 25_000);

    it('starts a fresh fixed window after the Redis TTL expires', async () => {
        const key = uniqueKey('rate-rollover');
        trackedRateLimitKeys.add(key);
        const first = await rateLimitBackend.increment(key, 250);
        const second = await rateLimitBackend.increment(key, 250);
        expect([first.count, second.count]).toEqual([1, 2]);

        await new Promise(resolve => setTimeout(resolve, first.ttlMs + 75));

        await expect(rateLimitBackend.increment(key, 250)).resolves.toMatchObject({
            count: 1,
        });
    });

    it('replaces an orphaned persistent counter with a fresh window', async () => {
        const key = uniqueKey('rate-persistent');
        trackedRateLimitKeys.add(key);
        const client = new Redis(redisUrl!);
        try {
            await client.set(redisRateLimitKey(key), '42');
            await expect(rateLimitBackend.increment(key, 5_000)).resolves.toEqual({
                count: 1,
                ttlMs: 5_000,
            });
        } finally {
            await client.quit();
        }
    });

    it('admits exactly one independent process for one Redis lock key', async () => {
        const key = uniqueKey('lock-contention');
        const participantCount = 4;
        const contenders = Array.from(
            { length: participantCount },
            (_, index) => startBarrierChild<{ acquired: boolean }>({
                mode: 'lock',
                url: redisUrl,
                key,
                owner: `worker-${index}`,
                ttlMs: 2_000,
                holdMs: 750,
                processBarrier: true,
            }),
        );
        try {
            let readyTimeout: NodeJS.Timeout | undefined;
            await Promise.race([
                Promise.all(contenders.map(contender => contender.ready)),
                new Promise<never>((_resolve, reject) => {
                    readyTimeout = setTimeout(
                        () => reject(new Error('Timed out waiting for Redis lock contenders')),
                        PROCESS_BARRIER_TIMEOUT_MS,
                    );
                }),
            ]).finally(() => {
                if (readyTimeout) clearTimeout(readyTimeout);
            });
            for (const contender of contenders) contender.release();
            const results = await Promise.all(contenders.map(contender => contender.result));

            expect(results.filter(result => result.acquired)).toHaveLength(1);
            await expect(firstLockBackend.isLocked(key)).resolves.toEqual({ locked: false });
        } finally {
            for (const contender of contenders) contender.terminate();
            await Promise.allSettled(contenders.map(contender => contender.result));
        }
    }, 50_000);

    it('protects lock ownership, extension, release, and expiry', async () => {
        const key = uniqueKey('lock-lifecycle');
        await expect(firstLockBackend.acquire(key, 'owner-a', 250)).resolves.toBe(true);
        await expect(secondLockBackend.acquire(key, 'owner-b', 250)).resolves.toBe(false);
        await expect(secondLockBackend.release(key, 'owner-b')).resolves.toBe(false);
        await expect(firstLockBackend.extend(key, 'owner-a', 600)).resolves.toBe(true);
        await new Promise(resolve => setTimeout(resolve, 325));
        await expect(secondLockBackend.acquire(key, 'owner-b', 250)).resolves.toBe(false);
        await expect(firstLockBackend.release(key, 'owner-a')).resolves.toBe(true);
        await expect(secondLockBackend.acquire(key, 'owner-b', 150)).resolves.toBe(true);
        await new Promise(resolve => setTimeout(resolve, 225));
        await expect(firstLockBackend.acquire(key, 'owner-a', 250)).resolves.toBe(true);
        await expect(firstLockBackend.release(key, 'owner-a')).resolves.toBe(true);
    });

    it('converges one Redis stream across independent consumer replicas', async () => {
        const queueName = uniqueKey('stream-convergence');
        const consumerGroup = uniqueKey('stream-group');
        const messageIds = Array.from(
            { length: 36 },
            (_, index) => 'message-' + (index + 1),
        );
        const publishResults = await runChild<Array<{
            success: boolean;
            messageId: string;
        }>>({
            mode: 'stream-publish',
            url: redisUrl,
            queueName,
            consumerGroup,
            consumerName: 'publisher',
            messages: messageIds.map(id => ({ id, payload: { id } })),
            startAt: Date.now(),
        });
        expect(publishResults).toEqual(messageIds.map(messageId => ({
            success: true,
            messageId,
        })));

        const startAt = Date.now() + 3_000;
        const replicaResults = await Promise.all(
            Array.from({ length: 6 }, (_, index) => runChild<Array<{
                messageId: string;
                redelivered: boolean;
            }>>({
                mode: 'stream-consume',
                url: redisUrl,
                queueName,
                consumerGroup,
                consumerName: 'consumer-' + (index + 1),
                count: 6,
                startAt,
            })),
        );
        const consumed = replicaResults.flat();

        expect(consumed).toHaveLength(messageIds.length);
        expect(consumed.map(message => message.messageId).sort())
            .toEqual([...messageIds].sort());
        expect(
            new Set(consumed.map(message => message.messageId)).size,
        ).toBe(messageIds.length);
        expect(consumed.every(message => message.redelivered === false)).toBe(true);

        const client = new Redis(redisUrl!);
        try {
            const pending = await client.xpending('stream:' + queueName, consumerGroup);
            expect(pending[0]).toBe(0);
        } finally {
            await client.del('stream:' + queueName);
            await client.quit();
        }
    }, 30_000);

    it('recovers a pending stream message after its consumer replica exits', async () => {
        const queueName = uniqueKey('stream-recovery');
        const consumerGroup = uniqueKey('recovery-group');
        const messageId = uniqueKey('recoverable-message');
        await runChild({
            mode: 'stream-publish',
            url: redisUrl,
            queueName,
            consumerGroup,
            consumerName: 'publisher',
            messages: [{ id: messageId, payload: { messageId } }],
            startAt: Date.now(),
        });

        const abandoned = await runChild<Array<{
            messageId: string;
            redelivered: boolean;
        }>>({
            mode: 'stream-abandon',
            url: redisUrl,
            queueName,
            consumerGroup,
            consumerName: 'consumer-that-exits',
            startAt: Date.now(),
        });
        expect(abandoned).toEqual([expect.objectContaining({
            messageId,
            redelivered: false,
        })]);

        const recovered = await runChild<Array<{
            messageId: string;
            redelivered: boolean;
        }>>({
            mode: 'stream-claim',
            url: redisUrl,
            queueName,
            consumerGroup,
            consumerName: 'replacement-consumer',
            count: 1,
            startAt: Date.now(),
        });
        expect(recovered).toEqual([expect.objectContaining({
            messageId,
            redelivered: true,
        })]);

        const client = new Redis(redisUrl!);
        try {
            const pending = await client.xpending('stream:' + queueName, consumerGroup);
            expect(pending[0]).toBe(0);
        } finally {
            await client.del('stream:' + queueName);
            await client.quit();
        }
    }, 20_000);

    it('fails closed when configured Redis is unreachable', async () => {
        const unavailableUrl = 'redis://127.0.0.1:1';
        const previousDataHubUrl = process.env.DATAHUB_REDIS_URL;
        const previousRedisUrl = process.env.REDIS_URL;
        process.env.DATAHUB_REDIS_URL = unavailableUrl;
        delete process.env.REDIS_URL;
        const service = new RateLimitService({
            createLogger: () => createLogger(),
        } as never);

        try {
            await service.onModuleInit();
            await expect(service.isRateLimited(
                { pipelineCode: 'orders', ip: '203.0.113.10' },
                10,
                60_000,
            )).rejects.toBeInstanceOf(RateLimitBackendUnavailableError);
            await expect(RedisLockBackend.create(unavailableUrl, createLogger()))
                .rejects.toBeDefined();
        } finally {
            await service.onModuleDestroy();
            if (previousDataHubUrl === undefined) delete process.env.DATAHUB_REDIS_URL;
            else process.env.DATAHUB_REDIS_URL = previousDataHubUrl;
            if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
            else process.env.REDIS_URL = previousRedisUrl;
        }
    }, 15_000);

    it('fails closed during an outage and recovers after Redis returns', async () => {
        const proxy = await createRedisProxy(redisUrl!);
        const previousDataHubUrl = process.env.DATAHUB_REDIS_URL;
        const previousRedisUrl = process.env.REDIS_URL;
        process.env.DATAHUB_REDIS_URL = proxy.url;
        delete process.env.REDIS_URL;
        const service = new RateLimitService({
            createLogger: () => createLogger(),
        } as never);
        const pipelineCode = uniqueKey('established-outage');
        const rateLimitKey = `ip:203.0.113.10:pipeline:${pipelineCode}`;
        trackedRateLimitKeys.add(rateLimitKey);

        try {
            await service.onModuleInit();
            await expect(service.isRateLimited(
                { pipelineCode, ip: '203.0.113.10' },
                10,
                60_000,
            )).resolves.toMatchObject({ limited: false });
            proxy.pause();
            await expect(service.isRateLimited(
                { pipelineCode, ip: '203.0.113.10' },
                10,
                60_000,
            )).rejects.toBeInstanceOf(RateLimitBackendUnavailableError);
            expect(service.getStats()).toEqual({});
            proxy.resume();
            await new Promise(resolve => setTimeout(resolve, 5_100));
            await expect(service.isRateLimited(
                { pipelineCode, ip: '203.0.113.10' },
                10,
                60_000,
            )).resolves.toMatchObject({ limited: false });
            const committedCount = await rateLimitBackend.getCount(rateLimitKey);
            expect([2, 3]).toContain(committedCount);
        } finally {
            await service.onModuleDestroy();
            await proxy.close();
            if (previousDataHubUrl === undefined) delete process.env.DATAHUB_REDIS_URL;
            else process.env.DATAHUB_REDIS_URL = previousDataHubUrl;
            if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
            else process.env.REDIS_URL = previousRedisUrl;
        }
    }, 15_000);
});
