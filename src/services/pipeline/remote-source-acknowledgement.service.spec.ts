import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import {
    DISTRIBUTED_LOCK,
    REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY,
} from '../../constants';
import { RunStatus } from '../../constants/enums';
import { createS3Client } from '../../extractors/s3/client';
import { createClient } from '../../extractors/ftp/connection';
import {
    appendRemoteSourceAcknowledgement,
    createRemoteSourceAcknowledgement,
    readRemoteSourceAcknowledgements,
} from '../../extractors/shared/remote-source-acknowledgement';
import type { JsonObject } from '../../types';
import { RemoteSourceAcknowledgementService } from './remote-source-acknowledgement.service';

vi.mock('../../extractors/s3/client', async importOriginal => ({
    ...await importOriginal<typeof import('../../extractors/s3/client')>(),
    createS3Client: vi.fn(),
}));

vi.mock('../../extractors/ftp/connection', async importOriginal => ({
    ...await importOriginal<typeof import('../../extractors/ftp/connection')>(),
    createClient: vi.fn(),
}));

const ctx = { channelId: 3 } as RequestContext;

function pendingCheckpoint(entries: Array<ReturnType<typeof createRemoteSourceAcknowledgement>>) {
    let step: JsonObject = {};
    for (const entry of entries) {
        step = appendRemoteSourceAcknowledgement(step, entry);
    }
    return { extract: step } as JsonObject;
}

function createEntry(
    runId: string,
    options: {
        adapterCode?: 's3' | 'ftp';
        action?: 'DELETE' | 'MOVE';
        sourcePath?: string;
        destinationPath?: string;
    } = {},
) {
    const adapterCode = options.adapterCode ?? 's3';
    return createRemoteSourceAcknowledgement({
        runId,
        stepKey: 'extract',
        adapterCode,
        action: options.action ?? 'DELETE',
        sourcePath: options.sourcePath ?? 'incoming/products.json',
        destinationPath: options.destinationPath,
        config: adapterCode === 's3'
            ? { bucket: 'catalog-imports', region: 'eu-central-1' }
            : {
                protocol: 'sftp',
                host: 'files.example.com',
                remotePath: '/incoming',
            },
    });
}

function createFixture(
    data: JsonObject,
    completedRunIds: string[],
    updateError?: Error,
) {
    const find = vi.fn(async () =>
        completedRunIds.map(id => ({ id })),
    );
    const checkpointService = {
        getByPipeline: vi.fn(async () => ({ data })),
        updateForPipeline: vi.fn(async (
            _ctx: RequestContext,
            _pipelineId: number,
            updater: (current: JsonObject) => JsonObject,
        ) => {
            if (updateError) throw updateError;
            data = updater(structuredClone(data));
            return { data };
        }),
    };
    const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    };
    const distributedLock = {
        acquire: vi.fn(async () => ({ acquired: true, token: 'ack-lock' })),
        extend: vi.fn(async () => true),
        release: vi.fn(async () => true),
    };
    const service = new RemoteSourceAcknowledgementService(
        { getRepository: vi.fn(() => ({ find })) } as never,
        checkpointService as never,
        {} as never,
        {} as never,
        { createLogger: vi.fn(() => logger) } as never,
        distributedLock as never,
    );
    return {
        service,
        find,
        checkpointService,
        distributedLock,
        logger,
        getData: () => data,
    };
}

function s3Client(overrides: Record<string, unknown> = {}) {
    return {
        listObjects: vi.fn(async () => ({
            objects: [],
            isTruncated: false,
        })),
        getObject: vi.fn(),
        deleteObject: vi.fn(async () => undefined),
        copyObject: vi.fn(async () => undefined),
        headBucket: vi.fn(),
        close: vi.fn(async () => undefined),
        ...overrides,
    };
}

function ftpClient(overrides: Record<string, unknown> = {}) {
    return {
        list: vi.fn(async () => []),
        download: vi.fn(),
        delete: vi.fn(async () => undefined),
        rename: vi.fn(async () => undefined),
        mkdir: vi.fn(),
        close: vi.fn(async () => undefined),
        ...overrides,
    };
}

describe('RemoteSourceAcknowledgementService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not acknowledge failed, cancelled, paused, or foreign runs', async () => {
        const data = pendingCheckpoint([
            createEntry('failed-run'),
            createEntry('cancelled-run'),
            createEntry('paused-run'),
            createEntry('foreign-run'),
        ]);
        const fixture = createFixture(data, []);

        await expect(
            fixture.service.acknowledgeCompletedForPipeline(ctx, 7),
        ).resolves.toEqual({ acknowledged: 0, failed: 0, pending: 4 });

        expect(createS3Client).not.toHaveBeenCalled();
        expect(fixture.checkpointService.updateForPipeline).not.toHaveBeenCalled();
        expect(fixture.find).toHaveBeenCalledWith({
            where: expect.objectContaining({
                pipelineId: 7,
                status: RunStatus.COMPLETED,
                channelId: '3',
            }),
            select: { id: true },
        });
    });

    it('bounds completed-run lookup for a large single-pipeline backlog', async () => {
        const runCount = REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY
            .RUN_ID_QUERY_BATCH_SIZE + 1;
        const runIds = Array.from(
            { length: runCount },
            (_, index) => `pending-run-${index}`,
        );
        const fixture = createFixture(
            pendingCheckpoint(runIds.map(runId => createEntry(runId))),
            [],
        );

        await expect(
            fixture.service.acknowledgeCompletedForPipeline(ctx, 7),
        ).resolves.toEqual({
            acknowledged: 0,
            failed: 0,
            pending: runCount,
        });

        expect(fixture.find).toHaveBeenCalledTimes(2);
        expect(createS3Client).not.toHaveBeenCalled();
        expect(fixture.checkpointService.updateForPipeline).not.toHaveBeenCalled();
    });

    it('acknowledges only runs returned as completed for this channel and pipeline', async () => {
        const first = createEntry('completed-run', { sourcePath: 'incoming/first.json' });
        const second = createEntry('pending-run', { sourcePath: 'incoming/second.json' });
        const data = pendingCheckpoint([first, second]);
        const client = s3Client();
        vi.mocked(createS3Client).mockResolvedValue(client);

        const fixture = createFixture(data, ['completed-run']);
        await expect(
            fixture.service.acknowledgeCompletedForPipeline(ctx, 7),
        ).resolves.toEqual({ acknowledged: 1, failed: 0, pending: 1 });

        expect(client.deleteObject).toHaveBeenCalledOnce();
        expect(client.deleteObject).toHaveBeenCalledWith('incoming/first.json');
        expect(readRemoteSourceAcknowledgements(
            fixture.getData().extract as JsonObject,
        )).toEqual([second]);
    });

    it('clears processed S3 keys only from the acknowledged step', async () => {
        const sourcePath = 'incoming/products.json';
        const first = createRemoteSourceAcknowledgement({
            runId: 'completed-run',
            stepKey: 'extract-a',
            adapterCode: 's3',
            action: 'DELETE',
            sourcePath,
            config: { bucket: 'catalog-imports', region: 'eu-central-1' },
        });
        const second = createRemoteSourceAcknowledgement({
            runId: 'pending-run',
            stepKey: 'extract-b',
            adapterCode: 's3',
            action: 'DELETE',
            sourcePath,
            config: { bucket: 'catalog-imports', region: 'eu-central-1' },
        });
        const data = {
            'extract-a': appendRemoteSourceAcknowledgement(
                { processedS3Keys: [sourcePath] },
                first,
            ),
            'extract-b': appendRemoteSourceAcknowledgement(
                { processedS3Keys: [sourcePath] },
                second,
            ),
        } as JsonObject;
        vi.mocked(createS3Client).mockResolvedValue(s3Client());
        const fixture = createFixture(data, ['completed-run']);

        await fixture.service.acknowledgeCompletedForPipeline(ctx, 7);

        expect(fixture.getData()['extract-a']).toMatchObject({
            processedS3Keys: [],
        });
        expect(fixture.getData()['extract-b']).toMatchObject({
            processedS3Keys: [sourcePath],
        });
    });

    it('treats an already moved S3 object as acknowledged when the destination exists', async () => {
        const entry = createEntry('completed-run', {
            action: 'MOVE',
            sourcePath: 'incoming/products.json',
            destinationPath: 'processed/products.json',
        });
        const client = s3Client({
            listObjects: vi.fn(async (prefix: string) => ({
                objects: prefix === 'processed/products.json'
                    ? [{ key: prefix }]
                    : [],
                isTruncated: false,
            })),
        });
        vi.mocked(createS3Client).mockResolvedValue(client);
        const fixture = createFixture(pendingCheckpoint([entry]), ['completed-run']);

        await expect(
            fixture.service.acknowledgeCompletedForPipeline(ctx, 7),
        ).resolves.toEqual({ acknowledged: 1, failed: 0, pending: 0 });

        expect(client.copyObject).not.toHaveBeenCalled();
        expect(client.deleteObject).not.toHaveBeenCalled();
    });

    it('treats a missing FTP source as an idempotently completed delete', async () => {
        const entry = createEntry('completed-run', {
            adapterCode: 'ftp',
            sourcePath: '/incoming/products.csv',
        });
        const client = ftpClient();
        vi.mocked(createClient).mockResolvedValue(client);
        const fixture = createFixture(pendingCheckpoint([entry]), ['completed-run']);

        await expect(
            fixture.service.acknowledgeCompletedForPipeline(ctx, 7),
        ).resolves.toEqual({ acknowledged: 1, failed: 0, pending: 0 });

        expect(client.delete).not.toHaveBeenCalled();
    });

    it('keeps the acknowledgement durable when checkpoint cleanup fails', async () => {
        const entry = createEntry('completed-run');
        const client = s3Client();
        vi.mocked(createS3Client).mockResolvedValue(client);
        const cleanupFailure = new Error('checkpoint cleanup failed');
        const fixture = createFixture(
            pendingCheckpoint([entry]),
            ['completed-run'],
            cleanupFailure,
        );

        await expect(
            fixture.service.acknowledgeCompletedForPipeline(ctx, 7),
        ).rejects.toThrow(cleanupFailure);

        expect(client.deleteObject).toHaveBeenCalledOnce();
        expect(readRemoteSourceAcknowledgements(
            fixture.getData().extract as JsonObject,
        )).toEqual([entry]);
    });

    it('leaves a failed move pending for a later execution', async () => {
        const entry = createEntry('completed-run', {
            action: 'MOVE',
            destinationPath: 'processed/products.json',
        });
        const client = s3Client();
        vi.mocked(createS3Client).mockResolvedValue(client);
        const fixture = createFixture(pendingCheckpoint([entry]), ['completed-run']);

        await expect(
            fixture.service.acknowledgeCompletedForPipeline(ctx, 7),
        ).resolves.toEqual({ acknowledged: 0, failed: 1, pending: 1 });

        expect(fixture.checkpointService.updateForPipeline).not.toHaveBeenCalled();
        expect(fixture.logger.warn).toHaveBeenCalledOnce();
    });

    it('keeps acknowledged data pending when the renewable lease is lost', async () => {
        vi.useFakeTimers();
        try {
            const entry = createEntry('completed-run');
            let resolveDelete!: () => void;
            const deletePending = new Promise<void>(resolve => {
                resolveDelete = resolve;
            });
            const client = s3Client({
                deleteObject: vi.fn(() => deletePending),
            });
            vi.mocked(createS3Client).mockResolvedValue(client);
            const fixture = createFixture(
                pendingCheckpoint([entry]),
                ['completed-run'],
            );
            fixture.distributedLock.extend.mockResolvedValue(false);

            const acknowledgement = fixture.service
                .acknowledgeCompletedForPipeline(ctx, 7);
            for (let attempt = 0; attempt < 10; attempt++) {
                await Promise.resolve();
                if (client.deleteObject.mock.calls.length > 0) break;
            }
            expect(client.deleteObject).toHaveBeenCalledOnce();

            await vi.advanceTimersByTimeAsync(
                DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_LOCK_REFRESH_MS,
            );
            resolveDelete();

            await expect(acknowledgement).rejects.toThrow(
                'Remote source acknowledgement lock was lost',
            );
            expect(fixture.checkpointService.updateForPipeline).not.toHaveBeenCalled();
            expect(readRemoteSourceAcknowledgements(
                fixture.getData().extract as JsonObject,
            )).toEqual([entry]);
            expect(fixture.distributedLock.release).toHaveBeenCalledWith(
                'data-hub:remote-source-acknowledgement:7',
                'ack-lock',
            );
        } finally {
            vi.useRealTimers();
        }
    });

});
