import { describe, expect, it, vi } from 'vitest';
import { HookActionExecutor } from './hook-action-executor';

function createExecutor() {
    const webhookRetryService = {
        sendWebhook: vi.fn().mockResolvedValue(undefined),
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
    const domainEvents = { publish: vi.fn() };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
    };
    return {
        domainEvents,
        executor: new HookActionExecutor(
            moduleRef as never,
            domainEvents as never,
            logger as never,
        ),
        logger,
        pipelineService,
        webhookRetryService,
    };
}

describe('HookActionExecutor', () => {
    it('publishes emit actions with the complete hook context', async () => {
        const fixture = createExecutor();

        await fixture.executor.execute({
            type: 'EMIT',
            event: 'catalog.loaded',
        }, {
            ctx: {} as never,
            stage: 'AFTER_LOAD',
            payload: [{ sku: 'SKU-1' }],
            record: { sku: 'SKU-2' },
            runId: 'run-1',
        });

        expect(fixture.domainEvents.publish).toHaveBeenCalledWith(
            'catalog.loaded',
            {
                stage: 'AFTER_LOAD',
                payload: [{ sku: 'SKU-1' }],
                record: { sku: 'SKU-2' },
                runId: 'run-1',
            },
        );
    });

    it('preserves error logger argument ordering for log actions', async () => {
        const fixture = createExecutor();

        await fixture.executor.execute({
            type: 'LOG',
            level: 'ERROR',
            message: 'Load failed',
        }, {
            ctx: {} as never,
            stage: 'ON_ERROR',
            record: { sku: 'SKU-1' },
            runId: 'run-1',
        });

        expect(fixture.logger.error).toHaveBeenCalledWith(
            'Load failed',
            undefined,
            {
                stage: 'ON_ERROR',
                runId: 'run-1',
                payload: { sku: 'SKU-1' },
            },
        );
    });

    it('disables webhook delivery when destroyed', async () => {
        const fixture = createExecutor();
        fixture.executor.initialize();
        fixture.executor.destroy();

        await expect(fixture.executor.execute({
            type: 'WEBHOOK',
            url: 'https://1.1.1.1/hook',
        }, {
            ctx: {} as never,
            stage: 'ON_ERROR',
        })).rejects.toThrow('Webhook delivery service is unavailable');
        expect(fixture.webhookRetryService.sendWebhook).not.toHaveBeenCalled();
    });
});
