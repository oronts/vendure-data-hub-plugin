import { describe, expect, it, vi } from 'vitest';
import { DataHubFeedAdminResolver } from './feed.resolver';

function createFixture() {
    const feedGenerator = {
        getRegisteredFeeds: vi.fn().mockResolvedValue([]),
        getFeedById: vi.fn().mockResolvedValue({ id: '1', code: 'catalog' }),
        createFeed: vi.fn(async (
            _ctx: unknown,
            input: Record<string, unknown>,
        ) => ({ id: '1', ...input })),
        updateFeed: vi.fn(async (
            _ctx: unknown,
            id: string,
            input: Record<string, unknown>,
        ): Promise<Record<string, unknown> | undefined> => ({ id, ...input })),
        deleteFeed: vi.fn().mockResolvedValue(true),
        generateFeedArtifact: vi.fn().mockResolvedValue({
            itemCount: 2,
            generatedAt: new Date('2026-07-16T12:00:00.000Z'),
            downloadUrl: '/data-hub/files/file_1_0123456789abcdef/download',
            errors: [],
            warnings: [],
        }),
        generateFeedPreview: vi.fn().mockResolvedValue({
            content: 'sku,name\nSKU-1,Product',
            contentType: 'text/csv',
            filename: 'catalog.csv',
            itemCount: 1,
            generatedAt: new Date('2026-07-16T12:00:00.000Z'),
            errors: [],
            warnings: [],
        }),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    return {
        feedGenerator,
        logger,
        resolver: new DataHubFeedAdminResolver(
            feedGenerator as never,
            { createLogger: vi.fn(() => logger) } as never,
        ),
    };
}

describe('DataHubFeedAdminResolver', () => {
    it('forwards the active channel context for the full lifecycle', async () => {
        const fixture = createFixture();
        const ctx = { channelId: 'channel-1' };
        const input = { code: 'catalog', name: 'Catalog', format: 'CSV' };

        await fixture.resolver.dataHubFeeds(ctx as never);
        await fixture.resolver.dataHubFeed(ctx as never, '1');
        await fixture.resolver.createDataHubFeed(ctx as never, input);
        await fixture.resolver.updateDataHubFeed(ctx as never, '1', input);
        const deletion = await fixture.resolver.deleteDataHubFeed(ctx as never, '1');

        expect(fixture.feedGenerator.getRegisteredFeeds).toHaveBeenCalledWith(ctx);
        expect(fixture.feedGenerator.getFeedById).toHaveBeenCalledWith(ctx, '1');
        expect(fixture.feedGenerator.createFeed).toHaveBeenCalledWith(ctx, input);
        expect(fixture.feedGenerator.updateFeed).toHaveBeenCalledWith(ctx, '1', input);
        expect(fixture.feedGenerator.deleteFeed).toHaveBeenCalledWith(ctx, '1');
        expect(deletion).toEqual({ result: 'DELETED' });
    });

    it('reports missing or failed lifecycle operations without leaking errors', async () => {
        const fixture = createFixture();
        fixture.feedGenerator.updateFeed.mockResolvedValue(undefined);

        await expect(fixture.resolver.updateDataHubFeed(
            {} as never,
            'missing',
            { code: 'catalog', name: 'Catalog', format: 'CSV' },
        )).rejects.toThrow('Feed not found: missing');

        fixture.feedGenerator.deleteFeed.mockRejectedValue(new Error('Database unavailable'));
        await expect(fixture.resolver.deleteDataHubFeed(
            {} as never,
            '1',
        )).resolves.toEqual({
            result: 'NOT_DELETED',
            message: 'Failed to delete feed due to an internal error',
        });
        expect(fixture.logger.error).toHaveBeenCalledWith(
            'Failed to delete feed',
            expect.any(Error),
            expect.objectContaining({ feedId: '1' }),
        );
    });

    it('returns the stored artifact download route from the service', async () => {
        const fixture = createFixture();
        const ctx = { channelId: 'channel-1' };

        const result = await fixture.resolver.generateDataHubFeed(
            ctx as never,
            'catalog',
        );

        expect(fixture.feedGenerator.generateFeedArtifact).toHaveBeenCalledWith(
            ctx,
            'catalog',
        );
        expect(result).toMatchObject({
            success: true,
            itemCount: 2,
            downloadUrl: '/data-hub/files/file_1_0123456789abcdef/download',
        });
    });

    it('does not return a fabricated URL when artifact generation fails', async () => {
        const fixture = createFixture();
        fixture.feedGenerator.generateFeedArtifact.mockRejectedValue(
            new Error('Storage unavailable'),
        );

        const result = await fixture.resolver.generateDataHubFeed(
            {} as never,
            'catalog',
        );

        expect(result).toMatchObject({
            success: false,
            itemCount: 0,
            errors: ['Storage unavailable'],
        });
        expect(result.downloadUrl).toBeUndefined();
    });

    it('bounds feed generation before rendering a preview', async () => {
        const fixture = createFixture();
        const ctx = { channelId: 'channel-1' };

        const result = await fixture.resolver.previewDataHubFeed(
            ctx as never,
            'catalog',
            25,
        );

        expect(fixture.feedGenerator.generateFeedPreview).toHaveBeenCalledWith(
            ctx,
            'catalog',
            25,
        );
        expect(result.itemCount).toBe(1);
    });

    it('returns complete structured preview content unchanged', async () => {
        const fixture = createFixture();
        const content = JSON.stringify({ items: [{ sku: 'SKU-1' }] }, null, 2);
        fixture.feedGenerator.generateFeedPreview.mockResolvedValue({
            content,
            contentType: 'application/json',
            itemCount: 1,
        });

        await expect(fixture.resolver.previewDataHubFeed(
            {} as never,
            'catalog',
            1,
        )).resolves.toEqual({
            content,
            contentType: 'application/json',
            itemCount: 1,
        });
    });
});
