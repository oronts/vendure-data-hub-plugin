import { afterEach, describe, expect, it, vi } from 'vitest';
import { RETENTION } from '../../constants';
import {
    DataHubEventTriggerOutbox,
    PipelineLog,
    PipelineRun,
} from '../../entities/pipeline';
import { DataHubRecordError } from '../../entities/data';
import { DataHubRetentionService } from './retention.service';

interface RetentionServiceInternals {
    runPurgeCycle(): Promise<void>;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

interface FixtureOptions {
    retentionDaysRuns?: number | null;
    retentionDaysLogs?: number | null;
    pluginRetentionDaysRuns?: number;
    pluginRetentionDaysErrors?: number;
    logBatches?: Array<Array<{ id: number }>>;
    eventOutboxBatches?: Array<Array<{ id: number }>>;
    isServer?: boolean;
    lockAcquired?: boolean;
}

function createSelectBuilder(batches: Array<Array<{ id: number }>> = []) {
    const queuedBatches = [...batches];
    const builder = {
        select: vi.fn(),
        where: vi.fn(),
        andWhere: vi.fn(),
        orderBy: vi.fn(),
        addOrderBy: vi.fn(),
        take: vi.fn(),
        getRawMany: vi.fn(async () => queuedBatches.shift() ?? []),
    };
    builder.select.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builder.andWhere.mockReturnValue(builder);
    builder.orderBy.mockReturnValue(builder);
    builder.addOrderBy.mockReturnValue(builder);
    builder.take.mockReturnValue(builder);
    return builder;
}

function createMutationBuilder() {
    let ids: unknown[] = [];
    const builder = {
        delete: vi.fn(),
        update: vi.fn(),
        set: vi.fn(),
        whereInIds: vi.fn((nextIds: unknown[]) => {
            ids = nextIds;
            return builder;
        }),
        execute: vi.fn(async () => ({ affected: ids.length })),
    };
    builder.delete.mockReturnValue(builder);
    builder.update.mockReturnValue(builder);
    builder.set.mockReturnValue(builder);
    return builder;
}

function createRepository(selectBuilders: Record<string, ReturnType<typeof createSelectBuilder>>) {
    const mutation = createMutationBuilder();
    return {
        mutation,
        repository: {
            createQueryBuilder: vi.fn((alias?: string) => (
                alias ? selectBuilders[alias] : mutation
            )),
        },
    };
}

function createFixture(options: FixtureOptions = {}) {
    const ctx = { channelId: 1 };
    const staleRunSelect = createSelectBuilder();
    const runSelect = createSelectBuilder();
    const eventOutboxSelect = createSelectBuilder(options.eventOutboxBatches);
    const errorSelect = createSelectBuilder();
    const logSelect = createSelectBuilder(options.logBatches);
    const run = createRepository({
        staleRun: staleRunSelect,
        pipelineRun: runSelect,
    });
    const eventOutbox = createRepository({ eventDelivery: eventOutboxSelect });
    const error = createRepository({ recordError: errorSelect });
    const log = createRepository({ pipelineLog: logSelect });
    const repositories = new Map<unknown, unknown>([
        [PipelineRun, run.repository],
        [DataHubEventTriggerOutbox, eventOutbox.repository],
        [DataHubRecordError, error.repository],
        [PipelineLog, log.repository],
    ]);
    const connection = {
        getRepository: vi.fn((_requestContext: unknown, entity: unknown) => repositories.get(entity)),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const settings = {
        get: vi.fn(async () => ({
            retentionDaysRuns: options.retentionDaysRuns ?? null,
            retentionDaysErrors: null,
            retentionDaysLogs: options.retentionDaysLogs ?? null,
            logPersistenceLevel: null,
        })),
    };
    const distributedLock = {
        acquire: vi.fn(async () => options.lockAcquired === false
            ? { acquired: false }
            : { acquired: true, token: 'retention-token' }),
        release: vi.fn(async () => true),
    };
    const service = new DataHubRetentionService(
        connection as never,
        { create: vi.fn(async () => ctx) } as never,
        {
            retentionDaysRuns: options.pluginRetentionDaysRuns ?? 0,
            retentionDaysErrors: options.pluginRetentionDaysErrors ?? 0,
        } as never,
        settings as never,
        {
            isServer: options.isServer ?? true,
            isWorker: !(options.isServer ?? true),
        } as never,
        distributedLock as never,
        { createLogger: vi.fn(() => logger) } as never,
    );

    return {
        connection,
        ctx,
        distributedLock,
        eventOutboxMutation: eventOutbox.mutation,
        eventOutboxSelect,
        logMutation: log.mutation,
        logSelect,
        logger,
        service,
        settings,
    };
}

async function purge(service: DataHubRetentionService): Promise<void> {
    await (service as unknown as { purge(): Promise<void> }).purge();
}

describe('DataHubRetentionService', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('waits for an active purge and releases its lease during shutdown', async () => {
        const fixture = createFixture();
        const pendingSettings = deferred<{
            retentionDaysRuns: null;
            retentionDaysErrors: null;
            retentionDaysLogs: null;
            logPersistenceLevel: null;
        }>();
        fixture.settings.get.mockReturnValueOnce(pendingSettings.promise);

        const purgeCycle = (fixture.service as unknown as RetentionServiceInternals)
            .runPurgeCycle();
        await vi.waitFor(() => expect(fixture.settings.get).toHaveBeenCalledOnce());
        let stopped = false;
        const shutdown = fixture.service.onModuleDestroy().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);
        expect(fixture.distributedLock.release).not.toHaveBeenCalled();
        pendingSettings.resolve({
            retentionDaysRuns: null,
            retentionDaysErrors: null,
            retentionDaysLogs: null,
            logPersistenceLevel: null,
        });
        await Promise.all([purgeCycle, shutdown]);

        expect(stopped).toBe(true);
        expect(fixture.distributedLock.release).toHaveBeenCalledWith(
            RETENTION.PURGE_LOCK_KEY,
            'retention-token',
        );
    });

    it('purges pipeline logs older than the configured retention period', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
        const fixture = createFixture({
            retentionDaysLogs: 7,
            logBatches: [[{ id: 1 }, { id: 2 }, { id: 3 }]],
        });

        await purge(fixture.service);

        expect(fixture.connection.getRepository).toHaveBeenCalledWith(fixture.ctx, PipelineLog);
        expect(fixture.logSelect.where).toHaveBeenCalledWith(
            'pipelineLog.createdAt < :cutoff',
            { cutoff: '2026-07-08T12:00:00.000Z' },
        );
        expect(fixture.logMutation.whereInIds).toHaveBeenCalledWith([1, 2, 3]);
        expect(fixture.logger.info).toHaveBeenCalledWith(
            'Retention purge completed',
            expect.objectContaining({ logsDeleted: 3 }),
        );
    });

    it('deletes old records in bounded batches', async () => {
        const firstBatch = Array.from(
            { length: RETENTION.PURGE_BATCH_SIZE },
            (_, index) => ({ id: index + 1 }),
        );
        const fixture = createFixture({
            retentionDaysLogs: 7,
            logBatches: [firstBatch, [{ id: RETENTION.PURGE_BATCH_SIZE + 1 }]],
        });

        await purge(fixture.service);

        expect(fixture.logSelect.getRawMany).toHaveBeenCalledTimes(2);
        expect(fixture.logMutation.execute).toHaveBeenCalledTimes(2);
        expect(fixture.logger.info).toHaveBeenCalledWith(
            'Retention purge completed',
            expect.objectContaining({ logsDeleted: RETENTION.PURGE_BATCH_SIZE + 1 }),
        );
    });

    it('purges delivered and permanently failed EVENT rows by their terminal timestamps', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
        const fixture = createFixture({
            retentionDaysRuns: 7,
            eventOutboxBatches: [
                [{ id: 10 }],
                [{ id: 11 }],
            ],
        });

        await purge(fixture.service);

        expect(fixture.eventOutboxSelect.where).toHaveBeenNthCalledWith(
            1,
            'eventDelivery.deliveredAt < :cutoff',
            { cutoff: '2026-07-08T12:00:00.000Z' },
        );
        expect(fixture.eventOutboxSelect.andWhere).toHaveBeenNthCalledWith(
            1,
            'eventDelivery.status = :status AND eventDelivery.deliveredAt IS NOT NULL',
            { status: 'DELIVERED' },
        );
        expect(fixture.eventOutboxSelect.where).toHaveBeenNthCalledWith(
            2,
            'eventDelivery.failedAt < :cutoff',
            { cutoff: '2026-07-08T12:00:00.000Z' },
        );
        expect(fixture.eventOutboxSelect.andWhere).toHaveBeenNthCalledWith(
            2,
            'eventDelivery.status = :status AND eventDelivery.failedAt IS NOT NULL',
            { status: 'FAILED' },
        );
        expect(fixture.eventOutboxMutation.whereInIds).toHaveBeenCalledWith([10]);
        expect(fixture.eventOutboxMutation.whereInIds).toHaveBeenCalledWith([11]);
        expect(fixture.logger.info).toHaveBeenCalledWith(
            'Retention purge completed',
            expect.objectContaining({ eventDeliveriesDeleted: 2 }),
        );
    });

    it('stops at the per-entity purge limit', async () => {
        const batchCount = RETENTION.MAX_ROWS_PER_ENTITY_PER_PURGE / RETENTION.PURGE_BATCH_SIZE;
        const batches = Array.from({ length: batchCount }, (_, batchIndex) => (
            Array.from({ length: RETENTION.PURGE_BATCH_SIZE }, (_, rowIndex) => ({
                id: batchIndex * RETENTION.PURGE_BATCH_SIZE + rowIndex + 1,
            }))
        ));
        const fixture = createFixture({ retentionDaysLogs: 7, logBatches: batches });

        await purge(fixture.service);

        expect(fixture.logMutation.execute).toHaveBeenCalledTimes(batchCount);
        expect(fixture.logger.warn).toHaveBeenCalledWith(
            'Retention purge reached the per-entity processing limit',
            {
                entity: 'pipeline logs',
                maxRows: RETENTION.MAX_ROWS_PER_ENTITY_PER_PURGE,
            },
        );
    });

    it.each([null, 0])('does not purge logs when retention is %s', async retentionDaysLogs => {
        const fixture = createFixture({ retentionDaysLogs });

        await purge(fixture.service);

        expect(fixture.connection.getRepository).not.toHaveBeenCalledWith(fixture.ctx, PipelineLog);
        expect(fixture.logMutation.execute).not.toHaveBeenCalled();
    });

    it('does not schedule retention work in a Vendure worker process', async () => {
        const fixture = createFixture({ isServer: false });

        await fixture.service.onModuleInit();

        expect(fixture.distributedLock.acquire).not.toHaveBeenCalled();
        expect(fixture.settings.get).not.toHaveBeenCalled();
    });

    it('fails before scheduling when code-first retention is invalid', async () => {
        const fixture = createFixture({ pluginRetentionDaysRuns: -1 });

        await expect(fixture.service.onModuleInit()).rejects.toThrow(
            'retentionDaysRuns must be an integer between 0 and 365',
        );

        expect(fixture.distributedLock.acquire).not.toHaveBeenCalled();
        expect(fixture.settings.get).not.toHaveBeenCalled();
    });

    it('fails closed when a stored retention value is invalid', async () => {
        const fixture = createFixture({ retentionDaysLogs: 366 });

        await expect(purge(fixture.service)).rejects.toThrow(
            'retentionDaysLogs must be an integer between 0 and 365',
        );

        expect(fixture.connection.getRepository).not.toHaveBeenCalled();
    });

    it('skips a purge cycle when another server owns the lease', async () => {
        vi.useFakeTimers();
        const fixture = createFixture({ lockAcquired: false });

        await fixture.service.onModuleInit();
        await fixture.service.onModuleDestroy();

        expect(fixture.distributedLock.acquire).toHaveBeenCalledWith(
            RETENTION.PURGE_LOCK_KEY,
            expect.objectContaining({ ttlMs: expect.any(Number) }),
        );
        expect(fixture.settings.get).not.toHaveBeenCalled();
        expect(fixture.distributedLock.release).not.toHaveBeenCalled();
    });
});
