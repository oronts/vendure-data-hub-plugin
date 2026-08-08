import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunStatus } from '../../constants/enums';
import { PipelineRevision } from '../../entities/pipeline';
import type { JsonObject } from '../../types';
import type { FileWatchCheckpointState } from './file-watch-checkpoint';
import { readFileWatchCheckpoint } from './file-watch-checkpoint';
import { FileWatchService } from './file-watch.service';

interface TestWatcherConfig {
    pipelineId: string;
    pipelineCode: string;
    revisionId: string;
    triggerKey: string;
    connectionCode: string;
    path: string;
    pollIntervalMs: number;
    minFileAge: number;
    recursive: boolean;
    autoStart: boolean;
}

interface TestWatcher {
    config: TestWatcherConfig;
    timer: NodeJS.Timeout;
    statusTimer?: NodeJS.Timeout;
    state: FileWatchCheckpointState;
    isProcessing: boolean;
    lockKey: string;
}

interface FileWatchInternals {
    watchers: Map<string, TestWatcher>;
    refreshWatchers(): Promise<void>;
    runPoll(config: TestWatcherConfig, lockKey: string): Promise<void>;
    pollForFiles(config: TestWatcherConfig, lockKey: string): Promise<void>;
    reconcilePendingRun(
        ctx: never,
        config: TestWatcherConfig,
        watcher: TestWatcher,
    ): Promise<boolean>;
    startPendingRun(
        ctx: never,
        config: TestWatcherConfig,
        watcher: TestWatcher,
    ): Promise<void>;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function createRefreshFixture(
    ensureSynchronized: () => Promise<void> = async () => undefined,
) {
    const pipeline = {
        id: 7,
        code: 'catalog-import',
        enabled: true,
        status: 'PUBLISHED',
        currentRevisionId: 11,
        definition: {
            version: 1,
            steps: [{
                key: 'incoming-file',
                type: 'TRIGGER',
                config: {
                    type: 'FILE',
                    fileWatch: {
                        connectionCode: 'warehouse-s3',
                        path: '/incoming',
                        pattern: '*.csv',
                        pollIntervalMs: 30_000,
                        recursive: true,
                    },
                },
            }],
        },
    };
    const pipelineRepository = {
        find: vi.fn(async () => [pipeline]),
    };
    const revisionRepository = {
        find: vi.fn(async () => [{
            id: 11,
            pipelineId: 7,
            type: 'PUBLISHED',
            definition: pipeline.definition,
        }]),
    };
    const checkpointService = {
        getByPipeline: vi.fn(async () => ({ data: {} })),
    };
    const sourceService = { listFiles: vi.fn(async () => []) };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const service = new FileWatchService(
        {
            getRepository: (_ctx: unknown, entity: unknown) => (
                entity === PipelineRevision ? revisionRepository : pipelineRepository
            ),
        } as never,
        { create: vi.fn(async () => ({})) } as never,
        {} as never,
        sourceService as never,
        checkpointService as never,
        { ensureSynchronized: vi.fn(ensureSynchronized) } as never,
        { createLogger: () => logger } as never,
        {} as never,
    );
    const internals = service as unknown as FileWatchInternals;
    vi.spyOn(internals, 'pollForFiles').mockResolvedValue(undefined);
    return { internals, pipeline, pipelineRepository, service };
}

const config: TestWatcherConfig = {
    pipelineId: '7',
    pipelineCode: 'catalog-import',
    revisionId: '11',
    triggerKey: 'incoming-file',
    connectionCode: 'warehouse-s3',
    path: '/incoming',
    pollIntervalMs: 30_000,
    minFileAge: 0,
    recursive: true,
    autoStart: true,
};

const pendingState: FileWatchCheckpointState = {
    pending: {
        file: {
            path: '/incoming/products.csv',
            name: 'products.csv',
            modifiedAt: '2026-07-15T10:00:00.000Z',
            size: 512,
        },
        revisionId: '11',
        connectionCode: 'warehouse-s3',
        attempt: 0,
    },
};

function createFixture() {
    const pipelineService = {
        runById: vi.fn(),
        startPinnedIdempotentRunWithSeed: vi.fn(),
    };
    const checkpointState: { data: JsonObject } = {
        data: { extractorCursor: 'page-2' },
    };
    const checkpointService = {
        getByPipeline: vi.fn().mockResolvedValue({ data: { extractorCursor: 'page-2' } }),
        updateForPipeline: vi.fn(async (
            _ctx: unknown,
            _pipelineId: unknown,
            updater: (current: JsonObject) => JsonObject,
        ) => {
            checkpointState.data = updater(structuredClone(checkpointState.data));
            return { data: checkpointState.data };
        }),
    };
    const sourceService = { listFiles: vi.fn(async () => []) };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const service = new FileWatchService(
        {} as never,
        {} as never,
        pipelineService as never,
        sourceService as never,
        checkpointService as never,
        { ensureSynchronized: vi.fn().mockResolvedValue(undefined) } as never,
        { createLogger: () => logger } as never,
        {} as never,
    );
    const internals = service as unknown as FileWatchInternals;
    const watcher: TestWatcher = {
        config,
        timer: setInterval(() => undefined, 30_000),
        state: structuredClone(pendingState),
        isProcessing: false,
        lockKey: 'file-watch:catalog-import',
    };
    internals.watchers.set('catalog-import:incoming-file', watcher);
    return { checkpointService, checkpointState, internals, pipelineService, watcher };
}

describe('FileWatchService terminal checkpoint lifecycle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('persists a pending run without advancing the file cursor when merely queued', async () => {
        const fixture = createFixture();
        fixture.pipelineService.startPinnedIdempotentRunWithSeed.mockResolvedValue({
            run: { id: 42 },
            duplicate: false,
        });

        await fixture.internals.startPendingRun({} as never, config, fixture.watcher);

        expect(
            fixture.pipelineService.startPinnedIdempotentRunWithSeed,
        ).toHaveBeenCalledWith(
            expect.anything(),
            config.pipelineId,
            pendingState.pending?.revisionId,
            expect.any(Array),
            expect.objectContaining({
                triggerKey: config.triggerKey,
                seedMode: 'SOURCE_REFERENCES',
            }),
        );
        const savedData = fixture.checkpointState.data;
        expect(readFileWatchCheckpoint(savedData, config.triggerKey)).toEqual({
            pending: {
                ...pendingState.pending,
                runId: '42',
            },
        });
        expect(fixture.watcher.state.cursor).toBeUndefined();
    });

    it('runs a persisted intent against its captured revision after republishing', async () => {
        const fixture = createFixture();
        fixture.watcher.state.pending = {
            ...fixture.watcher.state.pending!,
            revisionId: '10',
        };
        fixture.pipelineService.startPinnedIdempotentRunWithSeed.mockResolvedValue({
            run: { id: 42 },
            duplicate: false,
        });

        await fixture.internals.startPendingRun({} as never, config, fixture.watcher);

        expect(
            fixture.pipelineService.startPinnedIdempotentRunWithSeed,
        ).toHaveBeenCalledWith(
            expect.anything(),
            config.pipelineId,
            '10',
            expect.any(Array),
            expect.objectContaining({ triggerKey: config.triggerKey }),
        );
    });

    it('advances the cursor only after the corresponding run is completed', async () => {
        const fixture = createFixture();
        fixture.watcher.state.pending = {
            ...fixture.watcher.state.pending!,
            runId: 'run-42',
        };
        fixture.pipelineService.runById.mockResolvedValue({ status: RunStatus.COMPLETED });

        await expect(
            fixture.internals.reconcilePendingRun({} as never, config, fixture.watcher),
        ).resolves.toBe(true);

        expect(fixture.watcher.state).toEqual({
            cursor: {
                modifiedAt: '2026-07-15T10:00:00.000Z',
                path: '/incoming/products.csv',
            },
        });
        const savedData = fixture.checkpointState.data;
        expect(savedData.extractorCursor).toBe('page-2');
    });

    it('keeps a failed file pending and increments its retry attempt', async () => {
        const fixture = createFixture();
        fixture.watcher.state.pending = {
            ...fixture.watcher.state.pending!,
            runId: 'run-42',
        };
        fixture.pipelineService.runById.mockResolvedValue({ status: RunStatus.FAILED });

        await expect(
            fixture.internals.reconcilePendingRun({} as never, config, fixture.watcher),
        ).resolves.toBe(false);

        expect(fixture.watcher.state).toEqual({
            pending: {
                ...pendingState.pending,
                attempt: 1,
                runId: undefined,
            },
        });
        expect(fixture.watcher.state.cursor).toBeUndefined();
    });

    it('does not advance while a run is pending and schedules another status check', async () => {
        const fixture = createFixture();
        fixture.watcher.state.pending = {
            ...fixture.watcher.state.pending!,
            runId: 'run-42',
        };
        fixture.pipelineService.runById.mockResolvedValue({ status: RunStatus.RUNNING });

        await expect(
            fixture.internals.reconcilePendingRun({} as never, config, fixture.watcher),
        ).resolves.toBe(false);

        expect(fixture.checkpointService.updateForPipeline).not.toHaveBeenCalled();
        expect(fixture.watcher.state.cursor).toBeUndefined();
        expect(fixture.watcher.statusTimer).toBeDefined();
    });
});

describe('FileWatchService watcher reconciliation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('does not discover watchers before configuration synchronization', async () => {
        let resolveSync: (() => void) | undefined;
        const fixture = createRefreshFixture(() => new Promise(resolve => {
            resolveSync = resolve;
        }));

        const startup = fixture.service.onApplicationBootstrap();
        await Promise.resolve();

        expect(fixture.pipelineRepository.find).not.toHaveBeenCalled();
        resolveSync?.();
        await startup;

        expect(fixture.pipelineRepository.find).toHaveBeenCalledOnce();
        expect(fixture.internals.watchers.size).toBe(1);
        await fixture.service.onModuleDestroy();
    });

    it('drains an active refresh before removing all watchers', async () => {
        const fixture = createRefreshFixture();
        await fixture.internals.refreshWatchers();
        const pendingPipelines = deferred<typeof fixture.pipeline[]>();
        fixture.pipelineRepository.find.mockReturnValueOnce(pendingPipelines.promise);

        const refresh = fixture.internals.refreshWatchers();
        await vi.waitFor(() => {
            expect(fixture.pipelineRepository.find).toHaveBeenCalledTimes(2);
        });
        let stopped = false;
        const shutdown = fixture.service.onModuleDestroy().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);
        pendingPipelines.resolve([fixture.pipeline]);
        await Promise.all([refresh, shutdown]);

        expect(stopped).toBe(true);
        expect(fixture.internals.watchers.size).toBe(0);
    });

    it('waits for an active poll before removing its watcher', async () => {
        const fixture = createRefreshFixture();
        await fixture.internals.refreshWatchers();
        const pendingPoll = deferred<void>();
        vi.mocked(fixture.internals.pollForFiles).mockReturnValueOnce(pendingPoll.promise);

        const poll = fixture.internals.runPoll(config, 'file-watch:catalog-import');
        let stopped = false;
        const shutdown = fixture.service.onModuleDestroy().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);
        expect(fixture.internals.watchers.size).toBe(1);
        pendingPoll.resolve();
        await Promise.all([poll, shutdown]);

        expect(stopped).toBe(true);
        expect(fixture.internals.watchers.size).toBe(0);
    });

    it('keeps healthy watchers when configuration discovery fails', async () => {
        const fixture = createRefreshFixture();
        await fixture.internals.refreshWatchers();
        fixture.pipelineRepository.find.mockRejectedValueOnce(
            new Error('database unavailable'),
        );

        await expect(fixture.internals.refreshWatchers()).rejects.toThrow(
            'database unavailable',
        );

        expect(fixture.internals.watchers.size).toBe(1);
        expect(fixture.internals.watchers.has('catalog-import:incoming-file')).toBe(true);
    });

    it('restarts an existing watcher when its effective config changes', async () => {
        const fixture = createRefreshFixture();
        await fixture.internals.refreshWatchers();
        const original = fixture.internals.watchers.get(
            'catalog-import:incoming-file',
        );
        const triggerConfig = fixture.pipeline.definition.steps[0].config.fileWatch;
        triggerConfig.path = '/incoming/v2';
        triggerConfig.pollIntervalMs = 45_000;

        await fixture.internals.refreshWatchers();

        const restarted = fixture.internals.watchers.get(
            'catalog-import:incoming-file',
        );
        expect(restarted).not.toBe(original);
        expect(restarted?.config.path).toBe('/incoming/v2');
        expect(restarted?.config.pollIntervalMs).toBe(45_000);
        expect(fixture.internals.pollForFiles).toHaveBeenCalledTimes(2);
    });
});
