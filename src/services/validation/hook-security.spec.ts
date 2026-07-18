import { describe, expect, it } from 'vitest';
import type { PipelineDefinition, WebhookHookAction } from '../../types';
import {
    assertWebhookHookSecurity,
    sanitizePipelineDefinitionForOutput,
    validateHooks,
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

        validateHooks(definition, issues);

        expect(issues).toEqual([
            expect.objectContaining({
                errorCode: 'webhook-hook-security-invalid',
                message: expect.stringContaining('headerSecretCodes'),
            }),
        ]);
    });

    it('rejects malformed trigger-pipeline and script references', () => {
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                AFTER_LOAD: [
                    {
                        type: 'TRIGGER_PIPELINE',
                        pipelineCode: ' invalid ',
                        triggerKey: '',
                    },
                    {
                        type: 'SCRIPT',
                        scriptName: '../unsafe',
                    },
                ],
            },
        } as PipelineDefinition;
        const issues: Array<{ message: string; errorCode?: string }> = [];

        validateHooks(definition, issues);

        expect(issues).toHaveLength(2);
        expect(issues.every(issue => issue.errorCode === 'hook-action-invalid')).toBe(true);
    });

    it('accepts complete valid action shapes at supported stages', () => {
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                AFTER_LOAD: [
                    { type: 'EMIT', event: 'catalog.loaded', failOnError: true },
                    { type: 'LOG', level: 'INFO', message: 'Catalog loaded' },
                    { type: 'INTERCEPTOR', code: 'return records;', timeout: 1000 },
                    { type: 'SCRIPT', scriptName: 'normalize', args: { currency: 'EUR' } },
                ],
            },
        } as PipelineDefinition;
        const issues: Array<{ message: string; errorCode?: string }> = [];

        validateHooks(definition, issues);

        expect(issues).toEqual([]);
    });

    it('rejects unknown stages, malformed actions, and ignored lifecycle interceptors', () => {
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                AFTER_LODA: [{ type: 'LOG' }],
                AFTER_LOAD: [
                    null,
                    { type: 'UNKNOWN' },
                    { type: 'LOG', level: 'TRACE' },
                    { type: 'EMIT', event: '' },
                    { type: 'SCRIPT', scriptName: 'normalize', failOnError: 'yes' },
                    { type: 'INTERCEPTOR', code: '' },
                ],
                PIPELINE_COMPLETED: [{ type: 'INTERCEPTOR', code: 'return records;' }],
            },
        } as unknown as PipelineDefinition;
        const issues: Array<{ message: string; errorCode?: string }> = [];

        expect(() => validateHooks(definition, issues)).not.toThrow();
        expect(issues).toHaveLength(8);
        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ errorCode: 'hook-stage-invalid' }),
            expect.objectContaining({ message: expect.stringContaining('must be an object') }),
            expect.objectContaining({ message: expect.stringContaining('Unsupported hook action type') }),
            expect.objectContaining({ message: expect.stringContaining('LOG level') }),
            expect.objectContaining({ message: expect.stringContaining('EMIT event') }),
            expect.objectContaining({ message: expect.stringContaining('failOnError') }),
            expect.objectContaining({ message: expect.stringContaining('code must be a non-empty string') }),
            expect.objectContaining({ message: expect.stringContaining('only at data processing stages') }),
        ]));
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
