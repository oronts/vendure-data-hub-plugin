import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    describeRedisConnection,
    getConfiguredRedisConnection,
    getConfiguredRedisUrl,
} from './redis-configuration';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Redis configuration', () => {
    it('prefers the Data Hub-specific standalone URL', () => {
        vi.stubEnv('DATAHUB_REDIS_URL', ' redis://data-hub.internal:6379 ');
        vi.stubEnv('REDIS_URL', 'redis://shared.internal:6379');

        expect(getConfiguredRedisConnection()).toEqual({
            mode: 'standalone',
            url: 'redis://data-hub.internal:6379',
        });
        expect(getConfiguredRedisUrl()).toBe('redis://data-hub.internal:6379');
    });

    it('uses the shared Redis URL when the Data Hub URL is blank', () => {
        vi.stubEnv('DATAHUB_REDIS_URL', ' ');
        vi.stubEnv('REDIS_URL', ' redis://shared.internal:6379 ');

        expect(getConfiguredRedisConnection()).toEqual({
            mode: 'standalone',
            url: 'redis://shared.internal:6379',
        });
    });

    it('builds a typed Sentinel configuration with explicit security options', () => {
        vi.stubEnv(
            'DATAHUB_REDIS_SENTINELS',
            'sentinel-a.internal:26379, sentinel-b.internal, [2001:db8::10]:26380',
        );
        vi.stubEnv('DATAHUB_REDIS_SENTINEL_NAME', 'datahub-primary');
        vi.stubEnv('DATAHUB_REDIS_DB', '3');
        vi.stubEnv('DATAHUB_REDIS_USERNAME', ' app-user ');
        vi.stubEnv('DATAHUB_REDIS_PASSWORD', ' app-password ');
        vi.stubEnv('DATAHUB_REDIS_SENTINEL_USERNAME', ' sentinel-user ');
        vi.stubEnv('DATAHUB_REDIS_SENTINEL_PASSWORD', 'sentinel-password');
        vi.stubEnv('DATAHUB_REDIS_TLS', 'true');
        vi.stubEnv('DATAHUB_REDIS_SENTINEL_TLS', 'true');
        vi.stubEnv('REDIS_URL', 'redis://shared.internal:6379');

        const connection = getConfiguredRedisConnection();
        expect(connection).toEqual({
            mode: 'sentinel',
            sentinels: [
                { host: 'sentinel-a.internal', port: 26379 },
                { host: 'sentinel-b.internal', port: 26379 },
                { host: '2001:db8::10', port: 26380 },
            ],
            masterName: 'datahub-primary',
            db: 3,
            username: 'app-user',
            password: ' app-password ',
            sentinelUsername: 'sentinel-user',
            sentinelPassword: 'sentinel-password',
            tls: true,
            sentinelTls: true,
        });
        expect(getConfiguredRedisUrl()).toBeUndefined();
        expect(describeRedisConnection(connection!)).toBe(
            'sentinel://sentinel-a.internal:26379,sentinel-b.internal:26379,[2001:db8::10]:26380/datahub-primary?db=3',
        );
    });

    it('rejects incomplete, ambiguous, or malformed Sentinel settings', () => {
        vi.stubEnv('DATAHUB_REDIS_SENTINELS', 'sentinel-a:26379');
        expect(() => getConfiguredRedisConnection()).toThrow(
            'requires both DATAHUB_REDIS_SENTINELS and DATAHUB_REDIS_SENTINEL_NAME',
        );

        vi.stubEnv('DATAHUB_REDIS_SENTINEL_NAME', 'datahub-primary');
        vi.stubEnv('DATAHUB_REDIS_URL', 'redis://standalone:6379');
        expect(() => getConfiguredRedisConnection()).toThrow(
            'either DATAHUB_REDIS_URL or Redis Sentinel settings',
        );

        vi.stubEnv('DATAHUB_REDIS_URL', '');
        vi.stubEnv('DATAHUB_REDIS_SENTINELS', 'sentinel-a:26379,sentinel-a:26379');
        expect(() => getConfiguredRedisConnection()).toThrow('must not contain duplicate');

        vi.stubEnv('DATAHUB_REDIS_SENTINELS', 'sentinel-a:26379/path');
        expect(() => getConfiguredRedisConnection()).toThrow('Invalid Redis Sentinel node');

        vi.stubEnv('DATAHUB_REDIS_SENTINELS', 'sentinel-a:26379');
        vi.stubEnv('DATAHUB_REDIS_SENTINEL_NAME', 'primary\nforged-log');
        expect(() => getConfiguredRedisConnection()).toThrow(
            'DATAHUB_REDIS_SENTINEL_NAME must contain only',
        );
    });

    it('rejects invalid Sentinel database and TLS values', () => {
        vi.stubEnv('DATAHUB_REDIS_SENTINELS', 'sentinel-a:26379');
        vi.stubEnv('DATAHUB_REDIS_SENTINEL_NAME', 'datahub-primary');
        vi.stubEnv('DATAHUB_REDIS_DB', '-1');
        expect(() => getConfiguredRedisConnection()).toThrow(
            'DATAHUB_REDIS_DB must be a non-negative integer',
        );

        vi.stubEnv('DATAHUB_REDIS_DB', '0');
        vi.stubEnv('DATAHUB_REDIS_TLS', 'yes');
        expect(() => getConfiguredRedisConnection()).toThrow(
            'DATAHUB_REDIS_TLS must be true or false',
        );
    });

    it('returns undefined for blank configuration', () => {
        vi.stubEnv('DATAHUB_REDIS_URL', ' ');
        vi.stubEnv('REDIS_URL', ' ');

        expect(getConfiguredRedisConnection()).toBeUndefined();
        expect(getConfiguredRedisUrl()).toBeUndefined();
    });
});
