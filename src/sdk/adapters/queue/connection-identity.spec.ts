import { describe, expect, it } from 'vitest';
import { createQueueConnectionIdentity } from './connection-identity';

describe('queue connection identity', () => {
    it('is stable for equivalent configurations without exposing credentials', () => {
        const left = createQueueConnectionIdentity('redis-streams', {
            host: 'redis.example.com',
            password: 'top-secret',
            useTls: true,
        });
        const right = createQueueConnectionIdentity('redis-streams', {
            useTls: true,
            password: 'top-secret',
            host: 'redis.example.com',
        });

        expect(left).toBe(right);
        expect(left).not.toContain('redis.example.com');
        expect(left).not.toContain('top-secret');
    });

    it.each([
        ['credential', { password: 'first' }, { password: 'second' }],
        ['TLS mode', { useTls: false }, { useTls: true }],
        ['TLS options', { tls: { rejectUnauthorized: true } }, { tls: { rejectUnauthorized: false } }],
        ['endpoint', { endpoint: 'https://one.example.com' }, { endpoint: 'https://two.example.com' }],
    ])('changes when %s changes', (_label, left, right) => {
        expect(createQueueConnectionIdentity('queue', left))
            .not.toBe(createQueueConnectionIdentity('queue', right));
    });
});
