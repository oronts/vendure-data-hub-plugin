import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfiguredRedisUrl } from './redis-configuration';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('getConfiguredRedisUrl', () => {
    it('prefers the Data Hub-specific URL', () => {
        vi.stubEnv('DATAHUB_REDIS_URL', ' redis://data-hub.internal:6379 ');
        vi.stubEnv('REDIS_URL', 'redis://shared.internal:6379');

        expect(getConfiguredRedisUrl()).toBe('redis://data-hub.internal:6379');
    });

    it('uses the shared Redis URL when the Data Hub URL is blank', () => {
        vi.stubEnv('DATAHUB_REDIS_URL', ' ');
        vi.stubEnv('REDIS_URL', ' redis://shared.internal:6379 ');

        expect(getConfiguredRedisUrl()).toBe('redis://shared.internal:6379');
    });

    it('returns undefined for blank configuration', () => {
        vi.stubEnv('DATAHUB_REDIS_URL', ' ');
        vi.stubEnv('REDIS_URL', ' ');

        expect(getConfiguredRedisUrl()).toBeUndefined();
    });
});
