import type { RequestContext } from '@vendure/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { PipelineStatus, RevisionType } from '../../constants/enums';
import type { SchedulerConfig } from '../../types/plugin-options';
import { ScheduledPipelineExecutionService } from './schedule-execution.service';
import { DataHubScheduleHandler } from './schedule.handler';
import { ScheduleTimerService } from './schedule-timer.service';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function createScheduledPipeline(
    intervalSec = 300,
    code = 'catalog-sync',
    id = 1,
): Pipeline {
    const pipeline = new Pipeline();
    pipeline.id = id;
    pipeline.code = code;
    pipeline.name = 'Catalog sync';
    pipeline.enabled = true;
    pipeline.status = PipelineStatus.PUBLISHED;
    pipeline.currentRevisionId = id + 100;
    pipeline.definition = {
        version: 1,
        steps: [{
            key: 'interval-trigger',
            type: 'TRIGGER',
            config: { type: 'SCHEDULE', intervalSec },
        }],
    };
    return pipeline;
}

interface FixtureOptions {
    pipelines?: Pipeline[];
    scheduler?: SchedulerConfig;
    startRun?: () => Promise<unknown>;
    ensureSynchronized?: () => Promise<void>;
    isWorker?: boolean;
    runTasksInWorkerOnly?: boolean;
    distributedLock?: {
        acquire: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };
}

function createFixture(options: FixtureOptions = {}) {
    const pipeline = createScheduledPipeline();
    const pipelines = options.pipelines ?? [pipeline];
    const revisions = pipelines.map(item => {
        const revision = new PipelineRevision();
        revision.id = item.currentRevisionId!;
        revision.pipelineId = item.id;
        revision.type = RevisionType.PUBLISHED;
        revision.definition = item.definition;
        return revision;
    });
    const pipelineRepository = {
        find: vi.fn(async () => pipelines),
    };
    const revisionRepository = {
        find: vi.fn(async () => revisions),
    };
    const runRepository = {
        findOne: vi.fn(async () => null),
    };
    const connection = {
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => (
            entity === PipelineRun
                ? runRepository
                : entity === PipelineRevision
                    ? revisionRepository
                    : pipelineRepository
        )),
    };
    const requestContextService = {
        create: vi.fn(async () => ({ channelId: 1 } as RequestContext)),
    };
    const pipelineService = {
        startRun: vi.fn(options.startRun ?? (async () => ({ id: 10 }))),
    };
    const domainEvents = {
        publishScheduleActivated: vi.fn(),
        publishScheduleDeactivated: vi.fn(),
        publishTriggerFired: vi.fn(),
    };
    const configSync = {
        ensureSynchronized: vi.fn(
            options.ensureSynchronized ?? (async () => undefined),
        ),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const runtimeConfigService = {
        getSchedulerConfig: () => ({
            checkIntervalMs: 30_000,
            refreshIntervalMs: 60_000,
            minIntervalMs: 1_000,
            maxPipelineDiscovery: 1_000,
            maxTrackingEntries: 1_000,
            maxConsecutiveFailures: 5,
            ...options.scheduler,
        }),
    };
    const loggerFactory = { createLogger: () => logger };
    const scheduleExecution = new ScheduledPipelineExecutionService(
        connection as never,
        requestContextService as never,
        pipelineService as never,
        runtimeConfigService as never,
        domainEvents as never,
        loggerFactory as never,
        options.distributedLock as never,
    );
    const scheduleTimers = new ScheduleTimerService(
        runtimeConfigService as never,
        scheduleExecution,
        loggerFactory as never,
    );
    const handler = new DataHubScheduleHandler(
        connection as never,
        requestContextService as never,
        {
            schedulerOptions: {
                runTasksInWorkerOnly: options.runTasksInWorkerOnly ?? true,
            },
        } as never,
        { isWorker: options.isWorker ?? true } as never,
        runtimeConfigService as never,
        configSync as never,
        domainEvents as never,
        scheduleExecution,
        scheduleTimers,
        loggerFactory as never,
    );
    return {
        handler,
        pipeline,
        revision: revisions[0],
        pipelineRepository,
        revisionRepository,
        pipelineService,
        domainEvents,
        configSync,
        logger,
    };
}

describe('DataHubScheduleHandler refresh reconciliation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('preserves a long interval timer across cache refreshes', async () => {
        const fixture = createFixture();
        await fixture.handler.onApplicationBootstrap();

        await vi.advanceTimersByTimeAsync(300_000);

        expect(fixture.pipelineRepository.find).toHaveBeenCalledTimes(6);
        expect(fixture.pipelineService.startRun).toHaveBeenCalledOnce();
        expect(fixture.handler.getActiveScheduleCount()).toBe(1);
        await fixture.handler.onModuleDestroy();
    });

    it('uses Vendure scheduler ownership to avoid API and worker duplication', async () => {
        const apiFixture = createFixture({ isWorker: false });
        await apiFixture.handler.onApplicationBootstrap();

        expect(apiFixture.configSync.ensureSynchronized).not.toHaveBeenCalled();
        expect(apiFixture.pipelineRepository.find).not.toHaveBeenCalled();
        expect(apiFixture.handler.getActiveScheduleCount()).toBe(0);
        await apiFixture.handler.onModuleDestroy();

        const singleProcessFixture = createFixture({
            isWorker: false,
            runTasksInWorkerOnly: false,
        });
        await singleProcessFixture.handler.onApplicationBootstrap();

        expect(singleProcessFixture.configSync.ensureSynchronized).toHaveBeenCalledOnce();
        expect(singleProcessFixture.handler.getActiveScheduleCount()).toBe(1);
        await singleProcessFixture.handler.onModuleDestroy();
    });

    it('retains active schedules when discovery fails', async () => {
        const fixture = createFixture();
        await fixture.handler.onApplicationBootstrap();
        fixture.pipelineRepository.find.mockRejectedValueOnce(
            new Error('database unavailable'),
        );

        await expect(fixture.handler.forceRefresh()).rejects.toThrow(
            'database unavailable',
        );

        expect(fixture.handler.getActiveScheduleCount()).toBe(1);
        expect(fixture.handler.getScheduledPipelines()).toEqual(['catalog-sync']);
        await fixture.handler.onModuleDestroy();
    });

    it('replaces a timer when its interval changes', async () => {
        const fixture = createFixture();
        await fixture.handler.onApplicationBootstrap();
        fixture.revision.definition = createScheduledPipeline(120).definition;

        await fixture.handler.forceRefresh();
        await vi.advanceTimersByTimeAsync(120_000);

        expect(fixture.pipelineService.startRun).toHaveBeenCalledOnce();
        expect(fixture.handler.getActiveScheduleCount()).toBe(1);
        await fixture.handler.onModuleDestroy();
    });

    it('preserves active schedules when pipeline discovery exceeds the configured limit', async () => {
        const fixture = createFixture({
            scheduler: { maxPipelineDiscovery: 1 },
        });
        await fixture.handler.onApplicationBootstrap();
        fixture.pipelineRepository.find.mockResolvedValueOnce([
            fixture.pipeline,
            createScheduledPipeline(300, 'inventory-sync', 2),
        ]);

        await expect(fixture.handler.forceRefresh()).rejects.toThrow(
            'Runnable pipeline discovery exceeded the safe limit of 1',
        );

        expect(fixture.handler.getScheduledPipelines()).toEqual(['catalog-sync']);
        expect(fixture.pipelineRepository.find).toHaveBeenLastCalledWith(
            expect.objectContaining({ take: 2 }),
        );
        await fixture.handler.onModuleDestroy();
    });

    it('does not activate schedules that cannot be tracked safely', async () => {
        const fixture = createFixture({
            scheduler: { maxTrackingEntries: 1 },
        });
        fixture.revision.definition = {
            version: 1,
            steps: [
                {
                    key: 'first-trigger',
                    type: 'TRIGGER',
                    config: { type: 'SCHEDULE', intervalSec: 300 },
                },
                {
                    key: 'second-trigger',
                    type: 'TRIGGER',
                    config: { type: 'SCHEDULE', intervalSec: 300 },
                },
            ],
        };

        await fixture.handler.onApplicationBootstrap();

        expect(fixture.handler.getActiveScheduleCount()).toBe(1);
        expect(fixture.logger.error).toHaveBeenCalledWith(
            'Schedule tracking limit reached; excess schedules were not activated',
            undefined,
            expect.objectContaining({
                maxTrackingEntries: 1,
                skippedSchedules: 1,
            }),
        );
        await fixture.handler.onModuleDestroy();
    });

    it('deduplicates cron execution while operating at the tracking limit', async () => {
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        const fixture = createFixture({
            scheduler: {
                checkIntervalMs: 10_000,
                maxTrackingEntries: 1,
            },
        });
        fixture.revision.definition = {
            version: 1,
            steps: [
                {
                    key: 'first-cron',
                    type: 'TRIGGER',
                    config: { type: 'SCHEDULE', cron: '* * * * *' },
                },
                {
                    key: 'second-cron',
                    type: 'TRIGGER',
                    config: { type: 'SCHEDULE', cron: '* * * * *' },
                },
            ],
        };
        await fixture.handler.onApplicationBootstrap();

        await vi.advanceTimersByTimeAsync(20_000);

        expect(fixture.handler.getActiveScheduleCount()).toBe(1);
        expect(fixture.handler.getCronKeyCount()).toBe(1);
        expect(fixture.pipelineService.startRun).toHaveBeenCalledOnce();
        await fixture.handler.onModuleDestroy();
    });

    it('pauses a failing schedule immediately at the configured threshold', async () => {
        const fixture = createFixture({
            scheduler: {
                maxConsecutiveFailures: 2,
                refreshIntervalMs: 60_000,
            },
            startRun: async () => {
                throw new Error('queue unavailable');
            },
        });
        fixture.revision.definition = createScheduledPipeline(1).definition;
        await fixture.handler.onApplicationBootstrap();

        await vi.advanceTimersByTimeAsync(2_000);

        expect(fixture.pipelineService.startRun).toHaveBeenCalledTimes(2);
        expect(fixture.handler.getActiveScheduleCount()).toBe(0);
        expect(fixture.handler.getCircuitBreakerStatus().get('catalog-sync')).toEqual({
            failureCount: 2,
            isPaused: true,
        });
        expect(fixture.domainEvents.publishScheduleDeactivated).toHaveBeenCalledOnce();

        await fixture.handler.forceRefresh();
        expect(fixture.handler.getActiveScheduleCount()).toBe(0);
        expect(fixture.handler.getCircuitBreakerStatus().get('catalog-sync')?.isPaused).toBe(true);
        await fixture.handler.onModuleDestroy();
    });

    it('does not discover schedules before configuration synchronization', async () => {
        let resolveSync: (() => void) | undefined;
        const fixture = createFixture({
            ensureSynchronized: () => new Promise(resolve => {
                resolveSync = resolve;
            }),
        });

        const startup = fixture.handler.onApplicationBootstrap();
        await Promise.resolve();

        expect(fixture.pipelineRepository.find).not.toHaveBeenCalled();
        resolveSync?.();
        await startup;

        expect(fixture.pipelineRepository.find).toHaveBeenCalledOnce();
        expect(fixture.handler.getActiveScheduleCount()).toBe(1);
        await fixture.handler.onModuleDestroy();
    });

    it('drains an active refresh before clearing every recreated timer', async () => {
        const fixture = createFixture();
        await fixture.handler.onApplicationBootstrap();
        const pendingPipelines = deferred<Pipeline[]>();
        fixture.pipelineRepository.find.mockReturnValueOnce(pendingPipelines.promise);

        const refresh = fixture.handler.forceRefresh();
        await vi.waitFor(() => {
            expect(fixture.pipelineRepository.find).toHaveBeenCalledTimes(2);
        });
        let stopped = false;
        const shutdown = fixture.handler.onModuleDestroy().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);
        pendingPipelines.resolve([fixture.pipeline]);
        await Promise.all([refresh, shutdown]);

        expect(stopped).toBe(true);
        expect(fixture.handler.getActiveScheduleCount()).toBe(0);
    });
});

describe('DataHubScheduleHandler distributed occurrence claims', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function createSharedLock() {
        const claims = new Set<string>();
        return {
            acquire: vi.fn(async (key: string, _options?: unknown) => {
                if (claims.has(key)) return { acquired: false, currentOwner: 'peer' };
                claims.add(key);
                return { acquired: true, token: `token:${key}` };
            }),
            release: vi.fn(async () => true),
        };
    }

    it('does not start an in-flight claimed occurrence after shutdown begins', async () => {
        let resolveClaim: ((result: { acquired: true; token: string }) => void) | undefined;
        const distributedLock = {
            acquire: vi.fn(() => new Promise<{ acquired: true; token: string }>(resolve => {
                resolveClaim = resolve;
            })),
            release: vi.fn(async () => true),
        };
        const fixture = createFixture({
            scheduler: { minIntervalMs: 1_000 },
            distributedLock,
        });
        fixture.revision.definition = createScheduledPipeline(1).definition;
        await fixture.handler.onApplicationBootstrap();

        vi.advanceTimersByTime(1_000);
        await Promise.resolve();
        expect(distributedLock.acquire).toHaveBeenCalledOnce();

        const shutdown = fixture.handler.onModuleDestroy();
        resolveClaim?.({ acquired: true, token: 'claim-token' });
        await shutdown;

        expect(fixture.pipelineService.startRun).not.toHaveBeenCalled();
        expect(fixture.handler.getCircuitBreakerStatus().size).toBe(0);
    });

    it('starts each interval occurrence once across replicas', async () => {
        const distributedLock = createSharedLock();
        const first = createFixture({
            scheduler: { minIntervalMs: 1_000 },
            distributedLock,
        });
        const second = createFixture({
            scheduler: { minIntervalMs: 1_000 },
            distributedLock,
        });
        first.revision.definition = createScheduledPipeline(1).definition;
        second.revision.definition = createScheduledPipeline(1).definition;

        await first.handler.onApplicationBootstrap();
        await second.handler.onApplicationBootstrap();
        await vi.advanceTimersByTimeAsync(1_000);

        expect(
            first.pipelineService.startRun.mock.calls.length
            + second.pipelineService.startRun.mock.calls.length,
        ).toBe(1);
        expect(distributedLock.acquire).toHaveBeenCalledTimes(2);
        expect(distributedLock.acquire.mock.calls[0]?.[0]).toBe(
            distributedLock.acquire.mock.calls[1]?.[0],
        );
        expect(distributedLock.acquire.mock.calls[0]?.[1]).toMatchObject({
            ttlMs: 1_000,
            waitForLock: false,
        });
        expect(distributedLock.release).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1_000);
        expect(
            first.pipelineService.startRun.mock.calls.length
            + second.pipelineService.startRun.mock.calls.length,
        ).toBe(2);

        await first.handler.onModuleDestroy();
        await second.handler.onModuleDestroy();
    });

    it('retains a cron occurrence claim until the minute ends', async () => {
        const distributedLock = createSharedLock();
        const createCronFixture = () => {
            const fixture = createFixture({
                scheduler: { checkIntervalMs: 10_000 },
                distributedLock,
            });
            fixture.revision.definition = {
                version: 1,
                steps: [{
                    key: 'cron-trigger',
                    type: 'TRIGGER',
                    config: { type: 'SCHEDULE', cron: '* * * * *' },
                }],
            };
            return fixture;
        };
        const first = createCronFixture();
        const second = createCronFixture();

        await first.handler.onApplicationBootstrap();
        await second.handler.onApplicationBootstrap();
        await vi.advanceTimersByTimeAsync(10_000);

        expect(
            first.pipelineService.startRun.mock.calls.length
            + second.pipelineService.startRun.mock.calls.length,
        ).toBe(1);
        expect(distributedLock.acquire.mock.calls[0]?.[1]).toMatchObject({
            ttlMs: 50_000,
            waitForLock: false,
        });
        expect(distributedLock.release).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(50_000);
        expect(
            first.pipelineService.startRun.mock.calls.length
            + second.pipelineService.startRun.mock.calls.length,
        ).toBe(2);

        await first.handler.onModuleDestroy();
        await second.handler.onModuleDestroy();
    });
});
