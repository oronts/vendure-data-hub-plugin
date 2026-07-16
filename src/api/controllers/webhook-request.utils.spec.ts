import { describe, expect, it } from 'vitest';
import {
    resolveIncomingWebhookIdempotency,
    resolveIncomingWebhookRateLimit,
} from './webhook-request.utils';

describe('incoming webhook request configuration', () => {
    it('honors a custom idempotency header and TTL', () => {
        expect(resolveIncomingWebhookIdempotency(
            { 'x-request-id': 'order-42' },
            {
                requireIdempotencyKey: true,
                idempotencyKeyHeader: 'X-Request-ID',
                idempotencyTtlSec: 3_600,
            },
        )).toEqual({ key: 'order-42', ttlSeconds: 3_600 });
    });

    it('rejects missing, padded, duplicate, and oversized keys', () => {
        expect(() => resolveIncomingWebhookIdempotency(
            {},
            { requireIdempotencyKey: true },
        )).toThrow('Missing x-idempotency-key');
        expect(() => resolveIncomingWebhookIdempotency(
            { 'x-idempotency-key': ' padded ' },
            {},
        )).toThrow('Invalid x-idempotency-key');
        expect(() => resolveIncomingWebhookIdempotency(
            { 'x-idempotency-key': ['one', 'two'] },
            {},
        )).toThrow('Multiple x-idempotency-key');
        expect(() => resolveIncomingWebhookIdempotency(
            { 'x-idempotency-key': 'x'.repeat(257) },
            {},
        )).toThrow('Invalid x-idempotency-key');
    });

    it('uses the configured rate-limit window and rejects unsafe values', () => {
        expect(resolveIncomingWebhookRateLimit({
            rateLimit: 12,
            rateLimitWindow: 30,
        })).toEqual({ maxRequests: 12, windowMs: 30_000 });
        expect(() => resolveIncomingWebhookRateLimit({ rateLimit: -1 })).toThrow(
            'Invalid webhook rateLimit configuration',
        );
        expect(() => resolveIncomingWebhookRateLimit({ rateLimitWindow: 0 })).toThrow(
            'Invalid webhook rateLimitWindow configuration',
        );
    });
});
