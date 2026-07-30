import { describe, expect, it, vi } from 'vitest';
import { EMPTY } from 'rxjs';
import type { Job } from '@vendure/core';
import type { PipelineRunJobData } from '../types';
import { DataHubRunQueueHandler } from './pipeline-run.handler';

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
        handler.onModuleDestroy();
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
        handler.onModuleDestroy();
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
        handler.onModuleDestroy();
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
        handler.onModuleDestroy();
    });
});
