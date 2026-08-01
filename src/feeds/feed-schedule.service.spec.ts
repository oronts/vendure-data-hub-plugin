import { describe, expect, it, vi } from 'vitest';
import { DataHubFeed } from '../entities/config';
import { FeedScheduleService } from './feed-schedule.service';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function createFeed(): DataHubFeed {
    return Object.assign(new DataHubFeed(), {
        id: 'feed-1',
        code: 'catalog',
        name: 'Catalog',
        format: 'CSV',
        channelId: 'channel-1',
        channelToken: 'default-channel',
        scheduleEnabled: true,
        scheduleCron: '* * * * *',
        scheduleTimezone: 'UTC',
        lastScheduledAt: null,
    });
}

function createFixture(channelId = 'channel-1') {
    const feed = createFeed();
    const repository = {
        find: vi.fn().mockResolvedValue([feed]),
        findOne: vi.fn().mockResolvedValue(feed),
        save: vi.fn(async value => value),
    };
    const createContext = vi.fn(async (input: { channelOrToken?: string }) => (
        input.channelOrToken
            ? { channelId }
            : { channelId: 'admin-channel' }
    ));
    const feedGenerator = {
        generateFeedArtifact: vi.fn().mockResolvedValue({
            itemCount: 2,
            fileId: 'file_1_0123456789abcdef',
        }),
    };
    const distributedLock = {
        acquire: vi.fn().mockResolvedValue({ acquired: true, token: 'token' }),
        release: vi.fn().mockResolvedValue(true),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const service = new FeedScheduleService(
        { getRepository: vi.fn(() => repository) } as never,
        { create: createContext } as never,
        feedGenerator as never,
        distributedLock as never,
        { getSchedulerConfig: vi.fn(() => ({ checkIntervalMs: 30_000 })) } as never,
        { createLogger: vi.fn(() => logger) } as never,
    );
    return {
        service,
        feed,
        repository,
        feedGenerator,
        distributedLock,
        logger,
    };
}

describe('FeedScheduleService', () => {
    it('waits for an active schedule scan during shutdown', async () => {
        const fixture = createFixture();
        const pendingFeeds = deferred<DataHubFeed[]>();
        fixture.repository.find.mockReturnValueOnce(pendingFeeds.promise);

        const processing = fixture.service.processDueFeeds();
        await vi.waitFor(() => expect(fixture.repository.find).toHaveBeenCalledOnce());
        let stopped = false;
        const shutdown = fixture.service.onModuleDestroy().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);
        pendingFeeds.resolve([]);
        await Promise.all([processing, shutdown]);

        expect(stopped).toBe(true);
        await expect(fixture.service.processDueFeeds()).resolves.toBe(0);
    });

    it('claims a due schedule once per minute and uses the persisted channel', async () => {
        const fixture = createFixture();
        const now = new Date('2026-07-16T12:00:30.000Z');

        await expect(fixture.service.processDueFeeds(now)).resolves.toBe(1);
        await expect(fixture.service.processDueFeeds(now)).resolves.toBe(0);

        expect(fixture.repository.save).toHaveBeenCalledOnce();
        expect(fixture.feed.lastScheduledAt).toEqual(
            new Date('2026-07-16T12:00:00.000Z'),
        );
        expect(fixture.feedGenerator.generateFeedArtifact).toHaveBeenCalledOnce();
        expect(fixture.distributedLock.release).toHaveBeenCalledTimes(2);
    });

    it('fails closed when the persisted channel token resolves to another channel', async () => {
        const fixture = createFixture('different-channel');

        await expect(fixture.service.processDueFeeds(
            new Date('2026-07-16T12:00:00.000Z'),
        )).resolves.toBe(0);

        expect(fixture.feedGenerator.generateFeedArtifact).not.toHaveBeenCalled();
        expect(fixture.logger.error).toHaveBeenCalledWith(
            'Scheduled feed generation failed',
            expect.any(Error),
            expect.objectContaining({ feedCode: 'catalog' }),
        );
    });

    it('does not claim a schedule when another instance owns the lock', async () => {
        const fixture = createFixture();
        fixture.distributedLock.acquire.mockResolvedValue({ acquired: false });

        await expect(fixture.service.processDueFeeds(
            new Date('2026-07-16T12:00:00.000Z'),
        )).resolves.toBe(0);

        expect(fixture.repository.save).not.toHaveBeenCalled();
        expect(fixture.feedGenerator.generateFeedArtifact).not.toHaveBeenCalled();
    });
});
