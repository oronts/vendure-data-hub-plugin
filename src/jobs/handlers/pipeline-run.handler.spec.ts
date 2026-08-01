import { describe, expect, it, vi } from 'vitest';
import { EMPTY } from 'rxjs';
import type { Job } from '@vendure/core';
import type { PipelineRunJobData } from '../types';
import { DataHubRunQueueHandler } from './pipeline-run.handler';

interface HandlerInternals {
    runReconciliation(): Promise<void>;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

describe('DataHubRunQueueHandler', () => {
    it('passes Vendure attempt metadata to the pipeline runner', async () => {
        let processJob: ((job: Job<PipelineRunJobData>) => Promise<void>) | undefined;
        const queue = { add: vi.fn(async () => undefined) };
        const jobQueueService = {
            createQueue: vi.fn(async (options: { process: typeof processJob }) => {
                processJob = options.process;
                return queue;
            }),
        };
        const eventBus = { ofType: vi.fn(() => EMPTY) };
        const runRepository = {
            find: vi.fn(async () => []),
        };
        const connection = {
            getRepository: vi.fn(() => runRepository),
        };
        const runner = { execute: vi.fn(async () => undefined) };
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
        };
        const loggerFactory = { createLogger: vi.fn(() => logger) };
        const handler = new DataHubRunQueueHandler(
            jobQueueService as never,
            eventBus as never,
            connection as never,
            runner as never,
            loggerFactory as never,
        );

        await handler.onModuleInit();
        expect(processJob).toBeTypeOf('function');

        await processJob?.({
            id: 99,
            data: { runId: 42 },
            attempts: 2,
            retries: 4,
        } as Job<PipelineRunJobData>);

        expect(runner.execute).toHaveBeenCalledWith(42, {
            attempt: 2,
            maxAttempts: 5,
        });
        await handler.onModuleDestroy();
    });

    it('claims a run once before adding it to the queue', async () => {
        const queue = { add: vi.fn(async () => undefined) };
        const jobQueueService = {
            createQueue: vi.fn(async () => queue),
        };
        const eventBus = { ofType: vi.fn(() => EMPTY) };
        const runRepository = {
            find: vi.fn(async () => []),
            update: vi.fn()
                .mockResolvedValueOnce({ affected: 1 })
                .mockResolvedValue({ affected: 0 }),
        };
        const connection = {
            getRepository: vi.fn(() => runRepository),
        };
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
        };
        const handler = new DataHubRunQueueHandler(
            jobQueueService as never,
            eventBus as never,
            connection as never,
            { execute: vi.fn() } as never,
            { createLogger: vi.fn(() => logger) } as never,
        );
        await handler.onModuleInit();

        await handler.enqueueRun(42);
        await handler.enqueueRun(42);

        expect(queue.add).toHaveBeenCalledOnce();
        expect(queue.add).toHaveBeenCalledWith(
            { runId: 42 },
            { retries: 3 },
        );
        await handler.onModuleDestroy();
    });

    it('releases the dispatch claim when queue insertion fails', async () => {
        const queueError = new Error('queue unavailable');
        const queue = { add: vi.fn(async () => Promise.reject(queueError)) };
        const jobQueueService = {
            createQueue: vi.fn(async () => queue),
        };
        const eventBus = { ofType: vi.fn(() => EMPTY) };
        const runRepository = {
            find: vi.fn(async () => []),
            update: vi.fn()
                .mockResolvedValueOnce({ affected: 1 })
                .mockResolvedValueOnce({ affected: 1 }),
        };
        const connection = {
            getRepository: vi.fn(() => runRepository),
        };
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
        };
        const handler = new DataHubRunQueueHandler(
            jobQueueService as never,
            eventBus as never,
            connection as never,
            { execute: vi.fn() } as never,
            { createLogger: vi.fn(() => logger) } as never,
        );
        await handler.onModuleInit();

        await expect(handler.enqueueRun(42)).rejects.toThrow(queueError);
        expect(runRepository.update).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 42 }),
            { queueDispatchedAt: null },
        );
        await handler.onModuleDestroy();
    });

    it('recovers a stale durable queue request during initialization', async () => {
        const queue = { add: vi.fn(async () => undefined) };
        const jobQueueService = {
            createQueue: vi.fn(async () => queue),
        };
        const eventBus = { ofType: vi.fn(() => EMPTY) };
        const runRepository = {
            find: vi.fn(async () => [{ id: 42 }]),
            update: vi.fn()
                .mockResolvedValueOnce({ affected: 0 })
                .mockResolvedValueOnce({ affected: 1 }),
        };
        const connection = {
            getRepository: vi.fn(() => runRepository),
        };
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
        };
        const handler = new DataHubRunQueueHandler(
            jobQueueService as never,
            eventBus as never,
            connection as never,
            { execute: vi.fn() } as never,
            { createLogger: vi.fn(() => logger) } as never,
        );

        await handler.onModuleInit();

        expect(queue.add).toHaveBeenCalledWith(
            { runId: 42 },
            { retries: 3 },
        );
        await handler.onModuleDestroy();
    });

    it('runs only one reconciliation pass at a time', async () => {
        const pendingFind = deferred<Array<{ id: number }>>();
        const runRepository = {
            find: vi.fn()
                .mockResolvedValueOnce([])
                .mockReturnValueOnce(pendingFind.promise),
        };
        const handler = new DataHubRunQueueHandler(
            { createQueue: vi.fn(async () => ({ add: vi.fn() })) } as never,
            { ofType: vi.fn(() => EMPTY) } as never,
            { getRepository: vi.fn(() => runRepository) } as never,
            { execute: vi.fn() } as never,
            { createLogger: vi.fn(() => ({
                debug: vi.fn(),
                info: vi.fn(),
                error: vi.fn(),
            })) } as never,
        );
        await handler.onModuleInit();

        const internals = handler as unknown as HandlerInternals;
        const first = internals.runReconciliation();
        const second = internals.runReconciliation();

        expect(runRepository.find).toHaveBeenCalledTimes(2);
        await second;
        pendingFind.resolve([]);
        await first;
        await handler.onModuleDestroy();
    });

    it('does not dispatch rows returned after shutdown starts', async () => {
        const pendingFind = deferred<Array<{ id: number }>>();
        const queue = { add: vi.fn(async () => undefined) };
        const runRepository = {
            find: vi.fn(() => pendingFind.promise),
            update: vi.fn(async () => ({ affected: 1 })),
        };
        const handler = new DataHubRunQueueHandler(
            { createQueue: vi.fn(async () => queue) } as never,
            { ofType: vi.fn(() => EMPTY) } as never,
            { getRepository: vi.fn(() => runRepository) } as never,
            { execute: vi.fn() } as never,
            { createLogger: vi.fn(() => ({
                debug: vi.fn(),
                info: vi.fn(),
                error: vi.fn(),
            })) } as never,
        );

        const initialization = handler.onModuleInit();
        await vi.waitFor(() => expect(runRepository.find).toHaveBeenCalledOnce());
        const shutdown = handler.onModuleDestroy();
        pendingFind.resolve([{ id: 42 }]);
        await Promise.all([initialization, shutdown]);

        expect(queue.add).not.toHaveBeenCalled();
        expect(runRepository.update).not.toHaveBeenCalled();
    });

    it('releases a claim acquired while shutdown begins', async () => {
        const pendingClaim = deferred<{ affected: number }>();
        const queue = { add: vi.fn(async () => undefined) };
        const runRepository = {
            find: vi.fn(async () => []),
            update: vi.fn()
                .mockReturnValueOnce(pendingClaim.promise)
                .mockResolvedValueOnce({ affected: 1 }),
        };
        const handler = new DataHubRunQueueHandler(
            { createQueue: vi.fn(async () => queue) } as never,
            { ofType: vi.fn(() => EMPTY) } as never,
            { getRepository: vi.fn(() => runRepository) } as never,
            { execute: vi.fn() } as never,
            { createLogger: vi.fn(() => ({
                debug: vi.fn(),
                info: vi.fn(),
                error: vi.fn(),
            })) } as never,
        );
        await handler.onModuleInit();

        const dispatch = handler.enqueueRun(42);
        await vi.waitFor(() => expect(runRepository.update).toHaveBeenCalledOnce());
        const shutdown = handler.onModuleDestroy();
        pendingClaim.resolve({ affected: 1 });
        await Promise.all([dispatch, shutdown]);

        expect(queue.add).not.toHaveBeenCalled();
        expect(runRepository.update).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 42 }),
            { queueDispatchedAt: null },
        );
    });
});
