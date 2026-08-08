import { describe, expect, it } from 'vitest';
import { buildWebhookExampleCurl } from './pipeline-webhook-example';

describe('buildWebhookExampleCurl', () => {
    it('includes configured idempotency and HMAC headers', () => {
        const command = buildWebhookExampleCurl('http://localhost/data-hub/webhook/products', {
            key: 'webhook',
            requiresIdempotencyKey: true,
            hmacHeaderName: 'x-signature',
            idempotencyHeader: 'x-request-id',
            authType: 'HMAC',
            apiKeyHeaderName: 'x-api-key',
            apiKeyPrefix: '',
            jwtHeaderName: 'authorization',
        });

        expect(command).toContain("-H 'x-request-id: <unique-id>'");
        expect(command).toContain("-H 'x-signature: <hmac-of-body>'");
    });

    it('omits optional authentication headers when they are disabled', () => {
        const command = buildWebhookExampleCurl('http://localhost/data-hub/webhook/products', {
            key: 'webhook',
            requiresIdempotencyKey: false,
            hmacHeaderName: 'x-signature',
            idempotencyHeader: 'x-request-id',
            authType: 'NONE',
            apiKeyHeaderName: 'x-api-key',
            apiKeyPrefix: '',
            jwtHeaderName: 'authorization',
        });

        expect(command).not.toContain('x-request-id');
        expect(command).not.toContain('x-signature');
        expect(command).toContain("-d '{\"records\":[{\"id\":\"123\",\"name\":\"Example\"}]}'");
    });

    it.each([
        {
            authType: 'API_KEY',
            expected: "-H 'x-service-key: Token your-api-key'",
        },
        {
            authType: 'BASIC',
            expected: "--user 'username:password'",
        },
        {
            authType: 'JWT',
            expected: "-H 'x-jwt-token: Bearer your-bearer-token'",
        },
    ])('includes the $authType credentials required by the runtime verifier', ({
        authType,
        expected,
    }) => {
        const command = buildWebhookExampleCurl('http://localhost/data-hub/webhook/products', {
            key: 'webhook',
            requiresIdempotencyKey: false,
            hmacHeaderName: 'x-signature',
            idempotencyHeader: 'x-request-id',
            authType,
            apiKeyHeaderName: 'x-service-key',
            apiKeyPrefix: 'Token ',
            jwtHeaderName: 'x-jwt-token',
        });

        expect(command).toContain(expected);
    });
});
