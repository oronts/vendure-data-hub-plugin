import { describe, expect, it, vi } from 'vitest';
import { RunDataHubPipelinePermission } from '../../permissions';
import type { PipelineDefinition } from '../../types';
import { DataHubQueueAdminResolver } from './queue.resolver';

interface ConsumerFixtureStatus {
    pipelineCode: string;
    triggerKey: string;
    queueName: string;
    running: boolean;
    autoStart: boolean;
    desiredEnabled: boolean;
    messagesProcessed: number;
    messagesFailed: number;
    lastMessageAt: Date | null;
}

interface PipelineFixture {
    code: string;
    definition: PipelineDefinition;
}

function createFixture() {
    const definition = { version: 1, steps: [] } as PipelineDefinition;
    const messageConsumer = {
        getConsumerStatus: vi.fn((): ConsumerFixtureStatus[] => []),
        startConsumerByCode: vi.fn().mockResolvedValue(undefined),
        stopConsumerByCode: vi.fn().mockResolvedValue(undefined),
    };
    const pipelineService = {
        findByCodes: vi.fn(async (_ctx: unknown, codes: string[]): Promise<PipelineFixture[]> => (
            codes.map(code => ({ code, definition }))
        )),
        findByCode: vi.fn(async (_ctx: unknown, code: string): Promise<PipelineFixture | null> => ({
            code,
            definition,
        })),
    };
    const executionPermissions = {
        assertAllowed: vi.fn().mockResolvedValue(undefined),
    };
    const logger = {
        debug: vi.fn(),
    };

    return {
        logger,
        messageConsumer,
        pipelineService,
        executionPermissions,
        resolver: new DataHubQueueAdminResolver(
            {} as never,
            messageConsumer as never,
            pipelineService as never,
            executionPermissions as never,
            { createLogger: vi.fn(() => logger) } as never,
        ),
    };
}

describe('DataHubQueueAdminResolver consumer lifecycle', () => {
    it('forwards the selected trigger identity and request context', async () => {
        const fixture = createFixture();
        const args = { pipelineCode: 'orders', triggerKey: 'order-events' };
        const ctx = {} as never;

        await expect(fixture.resolver.startDataHubConsumer(ctx, args)).resolves.toBe(true);
        await expect(fixture.resolver.stopDataHubConsumer(ctx, args)).resolves.toBe(true);

        expect(fixture.messageConsumer.startConsumerByCode).toHaveBeenCalledWith(
            'orders',
            'order-events',
            ctx,
        );
        expect(fixture.executionPermissions.assertAllowed).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ version: 1 }),
        );
        expect(fixture.messageConsumer.stopConsumerByCode).toHaveBeenCalledWith(
            'orders',
            'order-events',
            ctx,
        );
    });

    it('requires run permission metadata for both lifecycle operations', () => {
        const expected = [RunDataHubPipelinePermission.Permission];

        expect(Reflect.getMetadata(
            '__permissions__',
            DataHubQueueAdminResolver.prototype.startDataHubConsumer,
        )).toEqual(expected);
        expect(Reflect.getMetadata(
            '__permissions__',
            DataHubQueueAdminResolver.prototype.stopDataHubConsumer,
        )).toEqual(expected);
    });

    it('does not start a consumer when execution capabilities are denied', async () => {
        const fixture = createFixture();
        fixture.executionPermissions.assertAllowed.mockRejectedValueOnce(
            new Error('Missing required permissions for this pipeline'),
        );

        await expect(fixture.resolver.startDataHubConsumer(
            {} as never,
            { pipelineCode: 'orders', triggerKey: 'order-events' },
        )).resolves.toBe(false);

        expect(fixture.messageConsumer.startConsumerByCode).not.toHaveBeenCalled();
    });

    it('hides consumers and rejects lifecycle changes outside the active channel', async () => {
        const fixture = createFixture();
        fixture.messageConsumer.getConsumerStatus.mockReturnValue([
            {
                pipelineCode: 'orders',
                autoStart: true,
                desiredEnabled: true,
                triggerKey: 'order-events',
                queueName: 'orders',
                running: true,
                messagesProcessed: 3,
                messagesFailed: 0,
                lastMessageAt: null,
            },
            {
                pipelineCode: 'private-orders',
                triggerKey: 'private-events',
                autoStart: false,
                desiredEnabled: false,
                queueName: 'private-orders',
                running: true,
                messagesProcessed: 5,
                messagesFailed: 1,
                lastMessageAt: null,
            },
        ]);
        fixture.pipelineService.findByCodes.mockResolvedValue([{
            code: 'orders',
            definition: { version: 1, steps: [] } as PipelineDefinition,
        }]);
        const ctx = { channelId: 'channel-a' };

        await expect(fixture.resolver.dataHubConsumers(ctx as never)).resolves.toEqual([
            expect.objectContaining({ pipelineCode: 'orders' }),
        ]);

        fixture.pipelineService.findByCode.mockResolvedValueOnce(null);
        await expect(fixture.resolver.startDataHubConsumer(
            ctx as never,
            { pipelineCode: 'private-orders' },
        )).resolves.toBe(false);
        expect(fixture.messageConsumer.startConsumerByCode).not.toHaveBeenCalled();
    });

    it('contains lifecycle failures without exposing internal errors', async () => {
        const fixture = createFixture();
        fixture.messageConsumer.startConsumerByCode.mockRejectedValue(
            new Error('broker credentials leaked here'),
        );

        await expect(fixture.resolver.startDataHubConsumer(
            {} as never,
            { pipelineCode: 'orders', triggerKey: 'order-events' },
        )).resolves.toBe(false);
        expect(fixture.logger.debug).toHaveBeenCalledWith(
            'Consumer start failed for pipeline orders',
            expect.objectContaining({ triggerKey: 'order-events' }),
        );
    });
});
