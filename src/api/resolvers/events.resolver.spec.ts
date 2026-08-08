import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    DataHubWebhookDelivery,
    Pipeline,
    PipelineRun,
} from '../../entities/pipeline';
import { DataHubEventsAdminResolver } from './events.resolver';

function createFixture() {
    const pipelineQuery = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        getMany: vi.fn(async () => [{ id: 3 }]),
    };
    const runRepository = {
        find: vi.fn(async () => [{ id: 1 }]),
    };
    const pipelineRepository = {
        createQueryBuilder: vi.fn(() => pipelineQuery),
    };
    const deliveryRepository = {
        find: vi.fn(async () => [{ id: 5 }]),
    };
    const connection = {
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => {
            if (entity === PipelineRun) return runRepository;
            if (entity === Pipeline) return pipelineRepository;
            if (entity === DataHubWebhookDelivery) return deliveryRepository;
            throw new Error('Unexpected entity');
        }),
    };
    const events = {
        list: vi.fn(() => [
            { name: 'direct-a', payload: { channelId: '17' }, createdAt: new Date() },
            { name: 'direct-b', payload: { channelId: '23' }, createdAt: new Date() },
            { name: 'run-a', payload: { runId: 1 }, createdAt: new Date() },
            { name: 'run-b', payload: { runId: 2 }, createdAt: new Date() },
            { name: 'pipeline-a', payload: { pipelineId: 3 }, createdAt: new Date() },
            { name: 'pipeline-b', payload: { pipelineId: 4 }, createdAt: new Date() },
            { name: 'delivery-a', payload: { deliveryId: 5 }, createdAt: new Date() },
            { name: 'delivery-b', payload: { deliveryId: 6 }, createdAt: new Date() },
            { name: 'mixed-channel', payload: { channelId: '17', runId: 2 }, createdAt: new Date() },
            { name: 'mixed-resource', payload: { runId: 1, pipelineId: 4 }, createdAt: new Date() },
            { name: 'unscoped', payload: {}, createdAt: new Date() },
        ]),
    };
    const resolver = new DataHubEventsAdminResolver(
        events as never,
        connection as unknown as TransactionalConnection,
    );
    const ctx = { channelId: 17 } as RequestContext;
    return {
        resolver,
        ctx,
        events,
        runRepository,
        pipelineQuery,
        deliveryRepository,
    };
}

describe('DataHubEventsAdminResolver channel isolation', () => {
    it('returns only events owned by the active channel', async () => {
        const fixture = createFixture();

        const result = await fixture.resolver.dataHubEvents(fixture.ctx, { limit: 20 });

        expect(result.map(event => event.name)).toEqual([
            'direct-a',
            'run-a',
            'pipeline-a',
            'delivery-a',
        ]);
        expect(fixture.runRepository.find).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ channelId: '17' }),
            select: { id: true },
        }));
        expect(fixture.pipelineQuery.innerJoin).toHaveBeenCalledWith(
            'pipeline.channels',
            'channel',
            'channel.id = :channelId',
            { channelId: 17 },
        );
        expect(fixture.deliveryRepository.find).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ channelId: '17' }),
            select: { id: true },
        }));
    });
});
