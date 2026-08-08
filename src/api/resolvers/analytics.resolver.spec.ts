import { describe, expect, it, vi } from 'vitest';
import { DeletionResult } from '@vendure/common/lib/generated-types';
import { PAGINATION } from '../../constants';
import { DataHubAnalyticsAdminResolver } from './analytics.resolver';

function createFixture() {
    const analytics = {
        getPipelinePerformance: vi.fn().mockResolvedValue([]),
    };
    const destinations = {
        getDestinations: vi.fn().mockResolvedValue([]),
        getDestination: vi.fn().mockResolvedValue(undefined),
        deleteDestination: vi.fn().mockResolvedValue(true),
    };
    return {
        analytics,
        destinations,
        resolver: new DataHubAnalyticsAdminResolver(
            analytics as never,
            {} as never,
            destinations as never,
            {} as never,
        ),
    };
}

describe('DataHubAnalyticsAdminResolver input bounds', () => {
    it.each([0, -1, 1.5])('rejects invalid pipeline limits (%s)', async limit => {
        const fixture = createFixture();

        await expect(fixture.resolver.dataHubPipelinePerformance(
            {} as never,
            { limit },
        )).rejects.toThrow('Limit must be a positive integer');
        expect(fixture.analytics.getPipelinePerformance).not.toHaveBeenCalled();
    });

    it('caps pipeline limits and applies the default time range', async () => {
        const fixture = createFixture();

        await fixture.resolver.dataHubPipelinePerformance(
            {} as never,
            { limit: PAGINATION.MAX_QUERY_LIMIT + 1 },
        );

        expect(fixture.analytics.getPipelinePerformance).toHaveBeenCalledWith(
            expect.anything(),
            {
                pipelineId: undefined,
                timeRange: '30d',
                limit: PAGINATION.MAX_QUERY_LIMIT,
            },
        );
    });

    it('rejects unsupported time ranges', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.dataHubPipelinePerformance(
            {} as never,
            { timeRange: 'all' },
        )).rejects.toThrow('Unsupported analytics time range: all');
    });
});

describe('DataHubAnalyticsAdminResolver destination scoping', () => {
    it('passes RequestContext to destination list queries', async () => {
        const fixture = createFixture();
        const ctx = { channelId: 'channel-a' };

        await fixture.resolver.dataHubExportDestinations(ctx as never);

        expect(fixture.destinations.getDestinations).toHaveBeenCalledWith(ctx);
    });

    it('passes RequestContext and ID to destination detail queries', async () => {
        const fixture = createFixture();
        const ctx = { channelId: 'channel-a' };

        await fixture.resolver.dataHubExportDestination(
            ctx as never,
            { id: 'partner' },
        );

        expect(fixture.destinations.getDestination).toHaveBeenCalledWith(
            ctx,
            'partner',
        );
    });

    it('deletes the destination in the active RequestContext', async () => {
        const fixture = createFixture();
        const ctx = { channelId: 'channel-a' };

        await expect(fixture.resolver.dataHubDeleteExportDestination(
            ctx as never,
            { id: 'partner' },
        )).resolves.toEqual({ result: DeletionResult.DELETED });
        expect(fixture.destinations.deleteDestination).toHaveBeenCalledWith(
            ctx,
            'partner',
        );
    });

    it('returns NOT_DELETED when the active channel has no matching destination', async () => {
        const fixture = createFixture();
        fixture.destinations.deleteDestination.mockResolvedValue(false);

        await expect(fixture.resolver.dataHubDeleteExportDestination(
            { channelId: 'channel-a' } as never,
            { id: 'missing' },
        )).resolves.toEqual({ result: DeletionResult.NOT_DELETED });
    });
});
