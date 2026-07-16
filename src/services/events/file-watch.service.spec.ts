import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunStatus } from '../../constants/enums';
import type { FileWatchCheckpointState } from './file-watch-checkpoint';
import { readFileWatchCheckpoint } from './file-watch-checkpoint';
import { FileWatchService } from './file-watch.service';

interface TestWatcherConfig {
    pipelineId: string;
    pipelineCode: string;
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

const config: TestWatcherConfig = {
    pipelineId: '7',
    pipelineCode: 'catalog-import',
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
        attempt: 0,
    },
};

function createFixture() {
    const pipelineService = {
        runById: vi.fn(),
        startIdempotentRunWithSeed: vi.fn(),
    };
    const checkpointService = {
        getByPipeline: vi.fn().mockResolvedValue({ data: { extractorCursor: 'page-2' } }),
        setForPipeline: vi.fn().mockResolvedValue(undefined),
    };
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
        {} as never,
        {} as never,
        checkpointService as never,
        { createLogger: () => logger } as never,
        {} as never,
    );
    const internals = service as unknown as FileWatchInternals;
    const watcher: TestWatcher = {
        config,
        timer: setInterval(() => undefined, 30_000),
        state: structuredClone(pendingState),
        isProcessing: false,
        lockKey: 'file-watch:catalog-import:incoming-file',
    };
    internals.watchers.set('catalog-import:incoming-file', watcher);
    return { internals, watcher, pipelineService, checkpointService };
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
        fixture.pipelineService.startIdempotentRunWithSeed.mockResolvedValue({
            run: { id: 42 },
            duplicate: false,
        });

        await fixture.internals.startPendingRun({} as never, config, fixture.watcher);

        const savedData = fixture.checkpointService.setForPipeline.mock.calls.at(-1)?.[2];
        expect(readFileWatchCheckpoint(savedData, config.triggerKey)).toEqual({
            pending: {
                ...pendingState.pending,
                runId: '42',
            },
        });
        expect(fixture.watcher.state.cursor).toBeUndefined();
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
        const savedData = fixture.checkpointService.setForPipeline.mock.calls.at(-1)?.[2];
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

        expect(fixture.checkpointService.setForPipeline).not.toHaveBeenCalled();
        expect(fixture.watcher.state.cursor).toBeUndefined();
        expect(fixture.watcher.statusTimer).toBeDefined();
    });
});
