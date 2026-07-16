import { describe, expect, it } from 'vitest';
import type { PipelineDefinition, WebhookHookAction } from '../../types';
import {
    assertWebhookHookSecurity,
    sanitizePipelineDefinitionForOutput,
    validateWebhookHooks,
} from './hook-security';

const SAFE_ACTION: WebhookHookAction = {
    type: 'WEBHOOK',
    url: 'https://hooks.example.com/orders',
    headers: { 'X-Source': 'data-hub' },
    headerSecretCodes: { Authorization: 'orders-webhook-token' },
    secretCode: 'orders-signing-secret',
    signatureHeader: 'X-DataHub-Signature',
};

describe('webhook hook security', () => {
    it('accepts secret-backed signatures and credential headers', () => {
        expect(() => assertWebhookHookSecurity(SAFE_ACTION)).not.toThrow();
    });

    it('rejects raw secrets, credential-bearing static headers, and URL credentials', () => {
        const unsafeActions = [
            { ...SAFE_ACTION, secret: 'plaintext' },
            { ...SAFE_ACTION, headers: { Authorization: 'Bearer plaintext' } },
            { ...SAFE_ACTION, url: 'https://user:password@hooks.example.com/orders' },
        ] as unknown as WebhookHookAction[];

        for (const action of unsafeActions) {
            expect(() => assertWebhookHookSecurity(action)).toThrow();
        }
    });

    it('adds actionable validation issues to the canonical definition check', () => {
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                ON_ERROR: [{
                    type: 'WEBHOOK',
                    url: 'https://hooks.example.com/error',
                    headers: { 'X-API-Key': 'plaintext' },
                }],
            },
        } as PipelineDefinition;
        const issues: Array<{ message: string; errorCode?: string }> = [];

        validateWebhookHooks(definition, issues);

        expect(issues).toEqual([
            expect.objectContaining({
                errorCode: 'webhook-hook-security-invalid',
                message: expect.stringContaining('headerSecretCodes'),
            }),
        ]);
    });

    it('removes legacy replay credentials from definitions returned by the API', () => {
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                ON_ERROR: [{
                    type: 'WEBHOOK',
                    url: 'https://user:password@hooks.example.com/error?token=plaintext&source=sync',
                    headers: {
                        Authorization: 'Bearer plaintext',
                        'X-Source': 'data-hub',
                    },
                    secret: 'plaintext',
                }],
            },
        } as unknown as PipelineDefinition;

        const sanitized = sanitizePipelineDefinitionForOutput(definition);
        const action = sanitized.hooks?.ON_ERROR?.[0] as unknown as Record<string, unknown>;

        expect(action).not.toHaveProperty('secret');
        expect(action.headers).toEqual({ 'X-Source': 'data-hub' });
        expect(action.url).toBe('https://hooks.example.com/error?source=sync');
        expect(definition).toHaveProperty('hooks.ON_ERROR.0.secret', 'plaintext');
    });
});
