import * as crypto from 'node:crypto';
import Redis from 'ioredis';
import { describe, expect, it } from 'vitest';
import type { DataHubLogger } from '../logger';
import { RedisRateLimitBackend } from '../rate-limit/redis-rate-limit.backend';
import { RedisLockBackend } from './lock-backends';
import {
    getConfiguredRedisConnection,
    type RedisConnectionConfiguration,
    type RedisSentinelNode,
} from './redis-configuration';

const primaryHost = process.env.DATAHUB_REDIS_SENTINEL_TEST_PRIMARY_HOST?.trim();
const replicaHosts = process.env.DATAHUB_REDIS_SENTINEL_TEST_REPLICA_HOSTS
    ?.split(',')
    .map(host => host.trim())
    .filter(Boolean) ?? [];
const sentinelList = process.env.DATAHUB_REDIS_SENTINELS?.trim();
const masterName = process.env.DATAHUB_REDIS_SENTINEL_NAME?.trim();
const testRunId = process.env.DATAHUB_REDIS_SENTINEL_TEST_RUN_ID?.trim();
const integrationDescribe = primaryHost
    && replicaHosts.length >= 2
    && sentinelList
    && masterName
    && testRunId
    ? describe
    : describe.skip;

function createLogger(): DataHubLogger {
    return {
        debug() {},
        info() {},
        warn() {},
        error() {},
    } as unknown as DataHubLogger;
}

function uniqueKey(scope: string): string {
    return `sentinel:${scope}:${process.pid}:${Date.now()}`;
}

function redisRateLimitKey(key: string): string {
    const digest = crypto.createHash('sha256').update(key).digest('hex');
    return `datahub:rate-limit:v1:${digest}`;
}

function createDirectClient(host: string, port: number): Redis {
    const client = new Redis({
        host,
        port,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    return client;
}

async function canReachRedis(host: string, port: number): Promise<boolean> {
    const probe = createDirectClient(host, port);
    try {
        await probe.connect();
        return await probe.ping() === 'PONG';
    } catch {
        return false;
    } finally {
        probe.disconnect(false);
    }
}

async function readRedisRole(client: Redis): Promise<string> {
    const role: unknown = await client.call('ROLE');
    if (!Array.isArray(role) || typeof role[0] !== 'string') {
        throw new Error('Redis returned an invalid ROLE response');
    }
    return role[0];
}

async function readRedisRoleAt(host: string, port: number): Promise<string> {
    const probe = createDirectClient(host, port);
    try {
        await probe.connect();
        return await readRedisRole(probe);
    } finally {
        probe.disconnect(false);
    }
}

async function readSentinelMaster(
    sentinel: Redis,
    monitoredMasterName: string,
): Promise<string> {
    const result: unknown = await sentinel.call(
        'SENTINEL',
        'get-master-addr-by-name',
        monitoredMasterName,
    );
    if (
        !Array.isArray(result)
        || result.length !== 2
        || typeof result[0] !== 'string'
        || typeof result[1] !== 'string'
    ) {
        throw new Error('Redis Sentinel returned an invalid master address');
    }
    return `${result[0]}:${result[1]}`;
}

async function waitFor<T>(
    operation: () => Promise<T>,
    accept: (value: T) => boolean,
    description: string,
    timeoutMs = 40_000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            const value = await operation();
            if (accept(value)) return value;
        } catch (error) {
            lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
    throw new Error(`Timed out waiting for ${description}${detail}`);
}

function assertSentinelConfiguration(
    connection: RedisConnectionConfiguration | undefined,
): asserts connection is Extract<RedisConnectionConfiguration, { mode: 'sentinel' }> {
    expect(connection?.mode).toBe('sentinel');
    if (!connection || connection.mode !== 'sentinel') {
        throw new Error('Redis Sentinel integration configuration is missing');
    }
}

integrationDescribe('Redis Sentinel failover integration', () => {
    it('preserves lock ownership and rate-limit state after unplanned primary loss', async () => {
        const connection = getConfiguredRedisConnection();
        assertSentinelConfiguration(connection);
        const sentinelNode: RedisSentinelNode = connection.sentinels[0];
        const sentinel = createDirectClient(sentinelNode.host, sentinelNode.port);
        const primary = createDirectClient(primaryHost!, 6379);
        const replicas = replicaHosts.map(host => createDirectClient(host, 6379));
        const logger = createLogger();
        let existingLock: RedisLockBackend | undefined;
        let existingRateLimit: RedisRateLimitBackend | undefined;
        let freshLock: RedisLockBackend | undefined;
        let freshRateLimit: RedisRateLimitBackend | undefined;

        try {
            await Promise.all([
                sentinel.connect(),
                primary.connect(),
                ...replicas.map(replica => replica.connect()),
            ]);
            existingLock = await RedisLockBackend.create(connection, logger);
            existingRateLimit = await RedisRateLimitBackend.create(connection, logger);

            const lockKey = uniqueKey('lock');
            const lockOwner = uniqueKey('owner');
            const rateKey = uniqueKey('rate');
            const replicatedRateKey = redisRateLimitKey(rateKey);
            const readyKey = `datahub:sentinel-test:ready:${testRunId}`;
            const windowMs = 120_000;

            await expect(existingLock.acquire(lockKey, lockOwner, 120_000))
                .resolves.toBe(true);
            await expect(existingRateLimit.increment(rateKey, windowMs))
                .resolves.toMatchObject({ count: 1 });

            await waitFor(
                async () => Promise.all(replicas.map(async replica => ({
                    owner: await replica.get(`datahub:lock:${lockKey}`),
                    count: await replica.get(replicatedRateKey),
                }))),
                states => states.every(({ owner, count }) => (
                    owner === lockOwner && count === '1'
                )),
                'all replicas to contain lock and quota state',
            );

            const originalMaster = await readSentinelMaster(
                sentinel,
                connection.masterName,
            );
            await primary.set(readyKey, 'ready', 'PX', 120_000);
            await waitFor(
                () => canReachRedis(primaryHost!, 6379),
                reachable => !reachable,
                'the external harness to terminate the original primary',
                60_000,
            );

            const promotedMaster = await waitFor(
                () => readSentinelMaster(sentinel, connection.masterName),
                address => address !== originalMaster,
                'Sentinel to elect and publish a replacement master',
            );
            expect(promotedMaster).not.toBe(originalMaster);

            const electedRoles = await waitFor(
                () => Promise.all(replicaHosts.map(host => readRedisRoleAt(host, 6379))),
                roles => roles.filter(role => role === 'master').length === 1
                    && roles.filter(role => role === 'slave').length === replicas.length - 1,
                'one replica to become master and the remaining replica to follow it',
            );
            expect(electedRoles.filter(role => role === 'master')).toHaveLength(1);
            await waitFor(
                () => existingLock!.isLocked(lockKey),
                status => status.locked && status.owner === lockOwner,
                'the existing lock client to reconnect through Sentinel',
            );
            const secondRateResult = await waitFor(
                () => existingRateLimit!.increment(rateKey, windowMs),
                result => result.count === 2,
                'the existing rate-limit client to reconnect through Sentinel',
            );
            expect(secondRateResult.count).toBe(2);

            freshLock = await RedisLockBackend.create(connection, logger);
            freshRateLimit = await RedisRateLimitBackend.create(connection, logger);
            await expect(freshLock.isLocked(lockKey)).resolves.toMatchObject({
                locked: true,
                owner: lockOwner,
            });
            await expect(freshRateLimit.getCount(rateKey)).resolves.toBe(2);

            await expect(freshLock.release(lockKey, 'not-the-owner')).resolves.toBe(false);
            await expect(existingLock.extend(lockKey, lockOwner, 60_000)).resolves.toBe(true);
            await expect(existingLock.release(lockKey, lockOwner)).resolves.toBe(true);
            await expect(freshLock.acquire(uniqueKey('post-failover'), lockOwner, 30_000))
                .resolves.toBe(true);
            await expect(freshRateLimit.increment(rateKey, windowMs))
                .resolves.toMatchObject({ count: 3 });
        } finally {
            await Promise.allSettled([
                existingLock?.close(),
                existingRateLimit?.close(),
                freshLock?.close(),
                freshRateLimit?.close(),
            ]);
            sentinel.disconnect(false);
            primary.disconnect(false);
            for (const replica of replicas) {
                replica.disconnect(false);
            }
        }
    }, 120_000);
});
