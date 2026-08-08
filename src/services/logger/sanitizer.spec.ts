import { describe, expect, it } from 'vitest';
import { sanitizeExecutionLogObject } from './execution-log-safety';
import { sanitizeForLog, sanitizeLogMessage } from './sanitizer';

describe('logger sanitization', () => {
    it('redacts credentials and PII embedded in free-form messages', () => {
        const message = sanitizeLogMessage(
            'request failed password="secret value" authorization: Bearer abc.def user=john@example.com url=https://client:hidden@example.com',
        );

        expect(message).not.toContain('secret value');
        expect(message).not.toContain('abc.def');
        expect(message).not.toContain('john@example.com');
        expect(message).not.toContain(':hidden@');
        expect(message).toContain('[REDACTED]');
    });

    it('redacts quoted credentials, auth headers, cookies, and metadata strings', () => {
        const message = sanitizeLogMessage([
            '{"password":"secret-json"}',
            'X-API-Key: key-123',
            'authorization: Basic dXNlcjpwYXNz',
            'Cookie: session=browser-secret; theme=dark',
            'secret=multi word value',
        ].join(', '));
        const metadata = sanitizeForLog({
            detail: 'request X-API-Key: metadata-key',
            response: '{"access_token":"metadata-token"}',
        });
        const serializedMetadata = JSON.stringify(metadata);

        for (const secret of [
            'secret-json',
            'key-123',
            'dXNlcjpwYXNz',
            'browser-secret',
            'multi word value',
            'metadata-key',
            'metadata-token',
        ]) {
            expect(message).not.toContain(secret);
            expect(serializedMetadata).not.toContain(secret);
        }
        expect(message).toContain('[REDACTED]');
        expect(serializedMetadata).toContain('[REDACTED]');
        expect(message).toContain('theme=dark');
    });

    it('redacts normalized environment and OAuth credential names', () => {
        const sanitized = sanitizeLogMessage([
            'AWS_SECRET_ACCESS_KEY=aws-secret-value',
            'client-secret=oauth-secret',
            'x-client-secret: header-secret',
        ].join(', '));

        expect(sanitized).not.toContain('aws-secret-value');
        expect(sanitized).not.toContain('oauth-secret');
        expect(sanitized).not.toContain('header-secret');
    });

    it('preserves dates and numeric identifiers while masking unambiguous phones', () => {
        const sanitized = sanitizeLogMessage(
            'retry on 2026-07-28 for order 123456789; call +49 30 12345678',
        );

        expect(sanitized).toContain('2026-07-28');
        expect(sanitized).toContain('123456789');
        expect(sanitized).not.toContain('+49 30 12345678');
        expect(sanitizeForLog({ phone: '123456789' })).toEqual({
            phone: '[REDACTED]',
        });
    });

    it('contains throwing metadata accessors', () => {
        const metadata = Object.defineProperty({}, 'dangerous', {
            enumerable: true,
            get: () => {
                throw new Error('getter executed');
            },
        });

        expect(() => sanitizeExecutionLogObject(metadata)).not.toThrow();
        expect(sanitizeExecutionLogObject(metadata)).toEqual({
            dangerous: '[SANITIZATION_FAILED]',
        });
    });

    it('bounds persisted object breadth, array size, strings, and total payload size', () => {
        const payload = {
            items: Array.from({ length: 100 }, () => 'x'.repeat(2000)),
            ...Object.fromEntries(Array.from({ length: 60 }, (_, index) => [
                `field-${index}`,
                'x'.repeat(2000),
            ])),
        };
        const sanitized = sanitizeExecutionLogObject(payload);
        const serialized = JSON.stringify(sanitized);

        expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(32 * 1024);
        expect(sanitized).toEqual(expect.objectContaining({ truncated: true }));
        expect(serialized).not.toContain('x'.repeat(1001));
    });

    it('stops iterating map and set payloads at their configured limits', () => {
        const map = new Map(
            Array.from({ length: 5000 }, (_, index) => [`field-${index}`, index]),
        );
        const set = new Set(Array.from({ length: 5000 }, (_, index) => index));
        const sanitized = sanitizeExecutionLogObject({ map, set });

        expect(Object.keys(sanitized?.map as object)).toHaveLength(50);
        expect(sanitized?.set).toHaveLength(50);
    });
});
