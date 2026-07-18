import { describe, expect, it, vi } from 'vitest';
import type { JsonObject, PipelineDefinition } from '../../types';
import { HookService } from './hook.service';
import { HookScriptRegistryService } from './hook-script-registry.service';

function createService() {
    const webhookRetryService = {
        sendWebhook: vi.fn().mockResolvedValue(undefined),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
    };
    const pipelineService = {
        startRunByCode: vi.fn(async () => ({ id: 'child-run-1' })),
    };
    const moduleRef = {
        get: vi.fn((token: { name?: string }) => (
            token.name === 'PipelineService'
                ? pipelineService
                : webhookRetryService
        )),
    };
    const service = new HookService(
        moduleRef as never,
        { publish: vi.fn() } as never,
        {} as never,
        new HookScriptRegistryService(),
        { createLogger: vi.fn(() => logger) } as never,
    );
    return { service, webhookRetryService, pipelineService, logger };
}

describe('HookService webhook credentials', () => {
    it('passes Secret Code references to durable delivery without resolving plaintext', async () => {
        const fixture = createService();
        await fixture.service.onModuleInit();
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                ON_ERROR: [{
                    type: 'WEBHOOK',
                    url: 'https://1.1.1.1/error',
                    headers: { 'X-Source': 'data-hub' },
                    headerSecretCodes: { Authorization: 'api-token' },
                    secretCode: 'signing-secret',
                    signatureHeader: 'X-Signature',
                }],
            },
        } as PipelineDefinition;
        const ctx = {} as never;

        const result = await fixture.service.run(ctx, definition, 'ON_ERROR', undefined, undefined, 'run-1');

        expect(fixture.webhookRetryService.sendWebhook).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                headers: { 'X-Source': 'data-hub' },
                headerSecretCodes: { Authorization: 'api-token' },
                secretCode: 'signing-secret',
                signatureHeader: 'X-Signature',
            }),
            expect.objectContaining({ runId: 'run-1', stage: 'ON_ERROR' }),
            expect.objectContaining({ idempotencyKey: expect.stringContaining('run-1-ON_ERROR') }),
        );
        expect(result).toEqual({
            status: 'EXECUTED',
            configured: 1,
            executed: 1,
            skipped: 0,
            failed: 0,
            errors: [],
        });
    });

    it('rejects legacy raw webhook secrets without sending', async () => {
        const fixture = createService();
        await fixture.service.onModuleInit();
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                ON_ERROR: [{
                    type: 'WEBHOOK',
                    url: 'https://hooks.example.com/error',
                    secret: 'plaintext',
                }],
            },
        } as unknown as PipelineDefinition;

        const result = await fixture.service.run({} as never, definition, 'ON_ERROR');

        expect(fixture.webhookRetryService.sendWebhook).not.toHaveBeenCalled();
        expect(fixture.logger.warn).toHaveBeenCalledWith(
            'Hook action failed',
            expect.objectContaining({ error: expect.stringContaining('cannot store raw secrets') }),
        );
        expect(result).toEqual({
            status: 'FAILED',
            configured: 1,
            executed: 0,
            skipped: 0,
            failed: 1,
            errors: [{
                action: 'WEBHOOK:1',
                type: 'WEBHOOK',
                error: 'Webhook hooks cannot store raw secrets; use secretCode',
            }],
        });
    });

    it('reports unconfigured and interceptor-only stages as skipped', async () => {
        const fixture = createService();
        const empty = await fixture.service.run({} as never, { version: 1, steps: [] } as PipelineDefinition, 'ON_ERROR');
        const interceptor = await fixture.service.run({} as never, {
            version: 1,
            steps: [],
            hooks: { ON_ERROR: [{ type: 'SCRIPT', scriptName: 'notify' }] },
        } as PipelineDefinition, 'ON_ERROR');

        expect(empty).toEqual({
            status: 'SKIPPED',
            configured: 0,
            executed: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        });
        expect(interceptor).toEqual({
            status: 'SKIPPED',
            configured: 1,
            executed: 0,
            skipped: 1,
            failed: 0,
            errors: [],
        });
    });

    it('executes script and observation actions through the hook test path', async () => {
        const fixture = createService();
        const script = vi.fn(async (records: readonly JsonObject[]) => records.map(record => ({
            ...record,
            tested: true,
        })));
        fixture.service.registerScript('test-script', script);
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                BEFORE_TRANSFORM: [
                    { type: 'SCRIPT', scriptName: 'test-script' },
                    { type: 'LOG', message: 'tested' },
                ],
            },
        } as PipelineDefinition;

        const result = await fixture.service.runTest(
            {} as never,
            definition,
            'BEFORE_TRANSFORM',
            { records: [{ sku: 'SKU-1' }] },
            'pipeline-1',
        );

        expect(script).toHaveBeenCalledWith(
            [{ sku: 'SKU-1' }],
            expect.objectContaining({
                pipelineId: 'pipeline-1',
                stage: 'BEFORE_TRANSFORM',
            }),
            undefined,
        );
        expect(result).toEqual({
            status: 'EXECUTED',
            configured: 2,
            executed: 2,
            skipped: 0,
            failed: 0,
            errors: [],
        });
    });

    it('reports malformed script output as a failed hook test', async () => {
        const fixture = createService();
        fixture.service.registerScript(
            'invalid-script',
            vi.fn(async () => ({ invalid: true })) as never,
        );
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                AFTER_TRANSFORM: [{
                    type: 'SCRIPT',
                    scriptName: 'invalid-script',
                }],
            },
        } as PipelineDefinition;

        await expect(fixture.service.runTest(
            {} as never,
            definition,
            'AFTER_TRANSFORM',
            [{ sku: 'SKU-1' }],
        )).resolves.toEqual({
            status: 'FAILED',
            configured: 1,
            executed: 0,
            skipped: 0,
            failed: 1,
            errors: [{
                action: 'SCRIPT',
                type: 'SCRIPT',
                error: 'Script must return an array of records or undefined',
            }],
        });
    });

    it('records the child run created by a trigger-pipeline action', async () => {
        const fixture = createService();
        const definition = {
            version: 1,
            steps: [],
            hooks: {
                PIPELINE_COMPLETED: [{
                    type: 'TRIGGER_PIPELINE',
                    pipelineCode: 'search-index',
                    triggerKey: 'hook',
                }],
            },
        } as PipelineDefinition;
        const payload = [{ sku: 'SKU-1' }];

        const result = await fixture.service.run(
            {} as never,
            definition,
            'PIPELINE_COMPLETED',
            payload,
            undefined,
            'parent-run-1',
        );

        expect(fixture.pipelineService.startRunByCode).toHaveBeenCalledWith(
            expect.anything(),
            'search-index',
            {
                seedRecords: payload,
                triggerKey: 'hook',
                triggeredBy: 'hook:hook',
            },
        );
        expect(fixture.logger.info).toHaveBeenCalledWith(
            'Pipeline triggered by hook',
            expect.objectContaining({
                childRunId: 'child-run-1',
                parentRunId: 'parent-run-1',
            }),
        );
        expect(result.status).toBe('EXECUTED');
    });

    it('propagates action failures only when failOnError is enabled', async () => {
        const fixture = createService();
        fixture.pipelineService.startRunByCode.mockRejectedValue(
            new Error('target cannot run'),
        );
        const action = {
            type: 'TRIGGER_PIPELINE' as const,
            pipelineCode: 'search-index',
            triggerKey: 'hook',
        };

        await expect(fixture.service.run({} as never, {
            version: 1,
            steps: [],
            hooks: { PIPELINE_COMPLETED: [action] },
        }, 'PIPELINE_COMPLETED')).resolves.toEqual(expect.objectContaining({
            status: 'FAILED',
            failed: 1,
        }));

        await expect(fixture.service.run({} as never, {
            version: 1,
            steps: [],
            hooks: {
                PIPELINE_COMPLETED: [{ ...action, failOnError: true }],
            },
        }, 'PIPELINE_COMPLETED')).rejects.toThrow(
            'Hook action "TRIGGER_PIPELINE:1" failed: target cannot run',
        );
    });
});
