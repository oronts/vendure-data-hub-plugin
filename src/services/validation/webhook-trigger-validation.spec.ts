import { describe, expect, it } from 'vitest';
import type { PipelineDefinition } from '../../types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { validateTrigger } from './trigger-validation';

function validate(definition: PipelineDefinition) {
    const issues: PipelineDefinitionIssue[] = [];
    const warnings: PipelineDefinitionIssue[] = [];
    validateTrigger(definition, issues, warnings);
    return {
        issues: issues.map(issue => issue.errorCode),
        warnings: warnings.map(warning => warning.errorCode),
    };
}

function webhookStep(key: string, config: Record<string, unknown>) {
    return { key, type: 'TRIGGER' as const, config: { type: 'WEBHOOK', ...config } };
}

describe('webhook trigger security validation', () => {
    it('validates every trigger step rather than only the first', () => {
        const result = validate({
            version: 1,
            steps: [
                webhookStep('public', { authentication: 'NONE' }),
                webhookStep('signed', { authentication: 'HMAC' }),
            ],
        });

        expect(result.warnings).toContain('unauthenticated-webhook');
        expect(result.issues).toContain('invalid-secret-code');
    });

    it('rejects legacy aliases and unsupported auth modes', () => {
        const legacy = validate({
            version: 1,
            steps: [webhookStep('legacy', {
                authType: 'HMAC',
                signature: 'hmac-sha256',
                hmacSecretCode: 'legacy-secret',
            })],
        });

        expect(legacy.issues).toContain('legacy-webhook-field');
        expect(legacy.issues).toContain('invalid-webhook-authentication');
    });

    it('accepts canonical bounded HMAC and idempotency settings', () => {
        const result = validate({
            version: 1,
            steps: [webhookStep('signed', {
                authentication: 'HMAC',
                secretCode: 'orders-signing-secret',
                hmacAlgorithm: 'SHA512',
                hmacHeaderName: 'X-Order-Signature',
                rateLimit: 50,
                rateLimitWindow: 30,
                requireIdempotencyKey: true,
                idempotencyKeyHeader: 'X-Request-ID',
                idempotencyTtlSec: 3_600,
            })],
        });

        expect(result).toEqual({ issues: [], warnings: [] });
    });

    it('rejects invalid request-control bounds and header names', () => {
        const result = validate({
            version: 1,
            steps: [webhookStep('invalid', {
                authentication: 'API_KEY',
                apiKeySecretCode: 'orders-api-key',
                apiKeyHeaderName: 'bad header',
                rateLimit: -1,
                rateLimitWindow: 0,
                idempotencyTtlSec: 1,
            })],
        });

        expect(result.issues).toEqual(expect.arrayContaining([
            'invalid-webhook-header-name',
            'invalid-webhook-rate-limit',
            'invalid-webhook-rate-limit-window',
            'invalid-webhook-idempotency-ttl',
        ]));
    });
});
