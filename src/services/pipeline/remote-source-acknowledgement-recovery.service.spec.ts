import type { Job, RequestContext } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DISTRIBUTED_LOCK,
    QUEUE_NAMES,
    REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY,
} from '../../constants';
import { DataHubCheckpoint } from '../../entities/data';
import { PipelineRun } from '../../entities/pipeline';
import {
    appendRemoteSourceAcknowledgement,
    createRemoteSourceAcknowledgement,
} from '../../extractors/shared/remote-source-acknowledgement';
import type { JsonObject } from '../../types';
import { RemoteSourceAcknowledgementRecoveryService } from './remote-source-acknowledgement-recovery.service';

interface RecoveryJobData {
    pipelineId: string;
    channelId: string;
    dispatchToken: string;
}

function pendingCheckpoint(...runIds: string[]): JsonObject {
    let step: JsonObject = {};
    for (const runId of runIds) {
        step = appendRemoteSourceAcknowledgement(
            step,
            createRemoteSourceAcknowledgement({
                runId,
                stepKey: 'extract',
                adapterCode: 's3',
                action: 'DELETE',
                sourcePath: `incoming/${runId}.json`,
                config: { bucket: 'catalog-imports', region: 'eu-central-1' },
            }),
        );
    }
    return { extract: step };
}

function createFixture(options: {
    checkpoints?: Array<{ id: number; pipelineId: number; data: JsonObject }>;
    completedRuns?: Array<{
        id: string;
        pipelineId: number;
        channelId: string | null;
    }>;
    resolvedChannelId?: string;
    channelAvailable?: boolean;
    leaderAcquired?: boolean;
    dispatchAcquired?: boolean;
    addError?: Error;
    acknowledgementResult?: { acknowledged: number; failed: number; pending: number };
} = {}) {
    const query = createCheckpointQuery(options.checkpoints ?? []);
    const find = vi.fn(async () => options.completedRuns ?? []);
    const connection = {
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => {
            if (entity === DataHubCheckpoint) {
                return { createQueryBuilder: vi.fn(() => query) };
            }
            if (entity === PipelineRun) return { find };
            throw new Error('Unexpected recovery repository');
        }),
    };
    const add = vi.fn(async () => {
        if (options.addError) throw options.addError;
        return {};
    });
    let processor: ((job: Job<RecoveryJobData>) => Promise<void>) | undefined;
    const createQueue = vi.fn(async (queueOptions: {
        process: (job: Job<RecoveryJobData>) => Promise<void>;
    }) => {
        processor = queueOptions.process;
        return { add };
    });
    const requestContextService = {
        create: vi.fn(async (input: { channelOrToken?: { id: string } }) => ({
            channelId: input.channelOrToken
                ? options.resolvedChannelId ?? '3'
                : '1',
        })),
    };
    const findChannel = vi.fn(async (_ctx: RequestContext, id: string) =>
        options.channelAvailable === false ? undefined : { id });
    const distributedLock = {
        acquire: vi.fn(async (key: string) => {
            if (key === DISTRIBUTED_LOCK
                .REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_KEY) {
                return options.leaderAcquired === false
                    ? { acquired: false }
                    : { acquired: true, token: 'recovery-leader' };
            }
            return options.dispatchAcquired === false
                ? { acquired: false }
                : { acquired: true, token: 'dispatch-token' };
        }),
        extend: vi.fn(async () => true),
        release: vi.fn(async () => true),
    };
    const acknowledgeCompletedForPipeline = vi.fn(async () =>
        options.acknowledgementResult
            ?? { acknowledged: 1, failed: 0, pending: 0 });
    const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    };
    const service = new RemoteSourceAcknowledgementRecoveryService(
        connection as never,
        requestContextService as never,
        { findOne: findChannel } as never,
        { createQueue } as never,
        { acknowledgeCompletedForPipeline } as never,
        distributedLock as never,
        { createLogger: vi.fn(() => logger) } as never,
    );
    return {
        service,
        add,
        acknowledgeCompletedForPipeline,
        createQueue,
        connection,
        distributedLock,
        find,
        findChannel,
        logger,
        getProcessor: () => processor,
    };
}

function createCheckpointQuery(
    checkpoints: Array<{ id: number; pipelineId: number; data: JsonObject }>,
) {
    const query = {
        select: vi.fn(),
        orderBy: vi.fn(),
        take: vi.fn(),
        where: vi.fn(),
        getMany: vi.fn(async () => checkpoints),
    };
    query.select.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.take.mockReturnValue(query);
    query.where.mockReturnValue(query);
    return query;
}

describe('RemoteSourceAcknowledgementRecoveryService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('queues one recovery job per pipeline and channel for completed runs', async () => {
        const fixture = createFixture({
            checkpoints: [{
                id: 1,
                pipelineId: 7,
                data: pendingCheckpoint('completed-run-a', 'completed-run-b'),
            }],
            completedRuns: [
                {
                    id: 'completed-run-a',
                    pipelineId: 7,
                    channelId: '3',
                },
                {
                    id: 'completed-run-b',
                    pipelineId: 7,
                    channelId: '3',
                },
            ],
        });

        await fixture.service.onModuleInit();
        await fixture.service.onModuleDestroy();

        expect(fixture.createQueue).toHaveBeenCalledWith(expect.objectContaining({
            name: QUEUE_NAMES.REMOTE_SOURCE_ACKNOWLEDGEMENT,
        }));
        expect(fixture.add).toHaveBeenCalledOnce();
        expect(fixture.add).toHaveBeenCalledWith({
            pipelineId: '7',
            channelId: '3',
            dispatchToken: 'dispatch-token',
        }, {
            retries: REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY.JOB_RETRIES,
        });
    });

    it('skips completed runs whose persisted channel is unavailable', async () => {
        const fixture = createFixture({
            checkpoints: [{
                id: 1,
                pipelineId: 7,
                data: pendingCheckpoint('completed-run'),
            }],
            completedRuns: [{
                id: 'completed-run',
                pipelineId: 7,
                channelId: null,
            }],
        });

        await fixture.service.onModuleInit();
        await fixture.service.onModuleDestroy();

        expect(fixture.add).not.toHaveBeenCalled();
        expect(fixture.logger.warn).toHaveBeenCalledWith(
            'Completed run cannot recover its remote source acknowledgement',
            expect.objectContaining({ runId: 'completed-run' }),
        );
    });

    it('rejects a job when the durable channel resolves differently', async () => {
        const fixture = createFixture({ resolvedChannelId: '4' });
        await fixture.service.onModuleInit();
        const processor = fixture.getProcessor();
        expect(processor).toBeDefined();

        await expect(processor!({
            data: {
                pipelineId: '7',
                channelId: '3',
                dispatchToken: 'dispatch-token',
            },
        } as never)).rejects.toThrow(
            'Remote source acknowledgement channel mismatch for pipeline 7',
        );
        expect(fixture.acknowledgeCompletedForPipeline).not.toHaveBeenCalled();
        await fixture.service.onModuleDestroy();
    });

    it('fails a job so Vendure retries when remote actions remain pending', async () => {
        const fixture = createFixture({
            acknowledgementResult: { acknowledged: 1, failed: 1, pending: 1 },
        });
        await fixture.service.onModuleInit();
        const processor = fixture.getProcessor();

        await expect(processor!({
            data: {
                pipelineId: '7',
                channelId: '3',
                dispatchToken: 'dispatch-token',
            },
        } as never)).rejects.toThrow(
            '1 remote source acknowledgement(s) remain pending for pipeline 7',
        );
        await fixture.service.onModuleDestroy();
    });

    it('releases the dispatch lease after successful processing', async () => {
        const fixture = createFixture();
        await fixture.service.onModuleInit();
        const processor = fixture.getProcessor();

        await processor!({
            data: {
                pipelineId: '7',
                channelId: '3',
                dispatchToken: 'dispatch-token',
            },
        } as never);

        expect(fixture.distributedLock.release).toHaveBeenCalledWith(
            'data-hub:remote-source-acknowledgement-dispatch:7:3',
            'dispatch-token',
        );
        await fixture.service.onModuleDestroy();
    });

    it('keeps the dispatch lease while Vendure retries failed remote work', async () => {
        const fixture = createFixture({
            acknowledgementResult: { acknowledged: 0, failed: 1, pending: 1 },
        });
        await fixture.service.onModuleInit();
        const processor = fixture.getProcessor();

        await expect(processor!({
            data: {
                pipelineId: '7',
                channelId: '3',
                dispatchToken: 'dispatch-token',
            },
        } as never)).rejects.toThrow('remain pending');

        expect(fixture.distributedLock.release).not.toHaveBeenCalledWith(
            'data-hub:remote-source-acknowledgement-dispatch:7:3',
            'dispatch-token',
        );
        await fixture.service.onModuleDestroy();
    });

    it('releases the dispatch lease when durable enqueueing fails', async () => {
        const enqueueError = new Error('queue unavailable');
        const fixture = createFixture({
            addError: enqueueError,
            checkpoints: [{
                id: 1,
                pipelineId: 7,
                data: pendingCheckpoint('completed-run'),
            }],
            completedRuns: [{
                id: 'completed-run',
                pipelineId: 7,
                channelId: '3',
            }],
        });

        await fixture.service.onModuleInit();

        expect(fixture.distributedLock.release).toHaveBeenCalledWith(
            'data-hub:remote-source-acknowledgement-dispatch:7:3',
            'dispatch-token',
        );
        expect(fixture.logger.error).toHaveBeenCalledWith(
            'Initial remote source acknowledgement reconciliation failed',
            enqueueError,
        );
        await fixture.service.onModuleDestroy();
    });

    it('does not scan checkpoints when another replica owns reconciliation', async () => {
        const fixture = createFixture({ leaderAcquired: false });

        await fixture.service.onModuleInit();
        await fixture.service.onModuleDestroy();

        expect(fixture.distributedLock.acquire).toHaveBeenCalledWith(
            DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_KEY,
            {
                ttlMs: DISTRIBUTED_LOCK
                    .REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_TTL_MS,
                waitForLock: false,
            },
        );
        expect(fixture.connection.getRepository).not.toHaveBeenCalled();
        expect(fixture.add).not.toHaveBeenCalled();
    });

    it('renews one leader lease before scanning the next checkpoint page', async () => {
        vi.useFakeTimers();
        try {
            const fixture = createFixture();
            await fixture.service.onModuleInit();

            await vi.advanceTimersByTimeAsync(
                REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY.RECONCILE_INTERVAL_MS,
            );

            expect(fixture.distributedLock.extend).toHaveBeenCalledWith(
                DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_KEY,
                'recovery-leader',
                DISTRIBUTED_LOCK
                    .REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_TTL_MS,
            );
            await fixture.service.onModuleDestroy();
            expect(fixture.distributedLock.release).toHaveBeenCalledWith(
                DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_KEY,
                'recovery-leader',
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('bounds completed-run lookup queries for database portability', async () => {
        const runCount = REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY
            .RUN_ID_QUERY_BATCH_SIZE + 1;
        const runIds = Array.from(
            { length: runCount },
            (_, index) => `completed-run-${index}`,
        );
        const fixture = createFixture({
            checkpoints: [{
                id: 1,
                pipelineId: 7,
                data: pendingCheckpoint(...runIds),
            }],
            completedRuns: runIds.map(id => ({
                id,
                pipelineId: 7,
                channelId: '3',
            })),
        });

        await fixture.service.onModuleInit();
        await fixture.service.onModuleDestroy();

        expect(fixture.find).toHaveBeenCalledTimes(2);
        expect(fixture.add).toHaveBeenCalledOnce();
    });

    it('fails closed when the durable channel no longer exists', async () => {
        const fixture = createFixture({ channelAvailable: false });
        await fixture.service.onModuleInit();
        const processor = fixture.getProcessor();

        await expect(processor!({
            data: {
                pipelineId: '7',
                channelId: '3',
                dispatchToken: 'dispatch-token',
            },
        } as never)).rejects.toThrow(
            'Remote source acknowledgement channel 3 no longer exists',
        );
        expect(fixture.acknowledgeCompletedForPipeline).not.toHaveBeenCalled();
        await fixture.service.onModuleDestroy();
    });
});
