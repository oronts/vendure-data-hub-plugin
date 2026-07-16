import { describe, expect, it, vi } from 'vitest';
import type { PipelineDefinition } from '../../types';
import { HookService } from './hook.service';

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
    const service = new HookService(
        { get: vi.fn(() => webhookRetryService) } as never,
        { publish: vi.fn() } as never,
        {} as never,
        { createLogger: vi.fn(() => logger) } as never,
    );
    return { service, webhookRetryService, logger };
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

        await fixture.service.run(ctx, definition, 'ON_ERROR', undefined, undefined, 'run-1');

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

        await fixture.service.run({} as never, definition, 'ON_ERROR');

        expect(fixture.webhookRetryService.sendWebhook).not.toHaveBeenCalled();
        expect(fixture.logger.warn).toHaveBeenCalledWith(
            'Hook action failed',
            expect.objectContaining({ error: expect.stringContaining('cannot store raw secrets') }),
        );
    });
});
