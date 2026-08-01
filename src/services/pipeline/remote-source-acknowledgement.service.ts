import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { RunStatus } from '../../constants/enums';
import {
    DISTRIBUTED_LOCK,
    LOGGER_CONTEXTS,
} from '../../constants';
import { PipelineRun } from '../../entities/pipeline';
import { createClient, FtpClient } from '../../extractors/ftp/connection';
import type { FtpExtractorConfig } from '../../extractors/ftp/types';
import { createS3Client, S3Client } from '../../extractors/s3/client';
import type { S3ExtractorConfig } from '../../extractors/s3/types';
import {
    readRemoteSourceAcknowledgements,
    RemoteSourceAcknowledgement,
    removeRemoteSourceAcknowledgements,
} from '../../extractors/shared/remote-source-acknowledgement';
import type { ExtractorContext, JsonObject, JsonValue } from '../../types';
import { getErrorMessage } from '../../utils/error.utils';
import { CheckpointService } from '../data/checkpoint.service';
import { ConnectionService } from '../config/connection.service';
import { SecretService } from '../config/secret.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import {
    createConnectionsAdapter,
    createLoggerAdapter,
    createSecretsAdapter,
} from '../../runtime/executors/context-adapters';
import { posix as path } from 'node:path';

export interface RemoteSourceAcknowledgementResult {
    acknowledged: number;
    failed: number;
    pending: number;
}

interface PendingAcknowledgement {
    stepKey: string;
    acknowledgement: RemoteSourceAcknowledgement;
}

@Injectable()
export class RemoteSourceAcknowledgementService {
    private readonly logger: DataHubLogger;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly checkpointService: CheckpointService,
        private readonly secretService: SecretService,
        private readonly connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        private readonly distributedLock: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(
            LOGGER_CONTEXTS.REMOTE_SOURCE_ACKNOWLEDGEMENT,
        );
    }

    async acknowledgeCompletedForPipeline(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<RemoteSourceAcknowledgementResult> {
        const lockKey = [
            DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_LOCK_PREFIX,
            String(pipelineId),
        ].join('');
        return this.withRenewedAcknowledgementLock(
            lockKey,
            assertLockHeld => this.acknowledgeCompletedForPipelineUnlocked(
                ctx,
                pipelineId,
                assertLockHeld,
            ),
        );
    }

    private async withRenewedAcknowledgementLock<T>(
        lockKey: string,
        action: (assertLockHeld: () => void) => Promise<T>,
    ): Promise<T> {
        const lock = await this.distributedLock.acquire(lockKey, {
            ttlMs: DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_LOCK_TTL_MS,
            waitForLock: true,
            waitTimeoutMs:
                DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_LOCK_WAIT_TIMEOUT_MS,
        });
        if (!lock.acquired || !lock.token) {
            throw new Error(`Could not acquire remote acknowledgement lock ${lockKey}`);
        }
        const lockToken = lock.token;

        let lockLossError: Error | null = null;
        let refreshInFlight: Promise<void> | null = null;
        const refreshTimer = setInterval(() => {
            if (refreshInFlight || lockLossError) return;
            refreshInFlight = this.refreshAcknowledgementLock(lockKey, lockToken)
                .then(error => {
                    lockLossError = error;
                })
                .finally(() => {
                    refreshInFlight = null;
                });
        }, DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_LOCK_REFRESH_MS);
        refreshTimer.unref();
        const assertLockHeld = (): void => {
            if (lockLossError) throw lockLossError;
        };

        try {
            const result = await action(assertLockHeld);
            clearInterval(refreshTimer);
            await refreshInFlight;
            assertLockHeld();
            return result;
        } finally {
            clearInterval(refreshTimer);
            await refreshInFlight;
            await this.distributedLock.release(lockKey, lockToken);
        }
    }

    private async refreshAcknowledgementLock(
        lockKey: string,
        token: string,
    ): Promise<Error | null> {
        try {
            const extended = await this.distributedLock.extend(
                lockKey,
                token,
                DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_LOCK_TTL_MS,
            );
            return extended
                ? null
                : new Error('Remote source acknowledgement lock was lost');
        } catch (error) {
            return new Error(
                `Remote source acknowledgement lock refresh failed: ${getErrorMessage(error)}`,
            );
        }
    }

    private async acknowledgeCompletedForPipelineUnlocked(
        ctx: RequestContext,
        pipelineId: ID,
        assertLockHeld: () => void,
    ): Promise<RemoteSourceAcknowledgementResult> {
        assertLockHeld();
        const checkpoint = await this.checkpointService.getByPipeline(ctx, pipelineId);
        const pending = this.collectPending(checkpoint?.data);
        if (pending.length === 0) {
            return { acknowledged: 0, failed: 0, pending: 0 };
        }

        const completedRunIds = await this.findCompletedRunIds(
            ctx,
            pipelineId,
            pending.map(item => item.acknowledgement.runId),
        );
        const eligible = pending.filter(item =>
            completedRunIds.has(item.acknowledgement.runId),
        );
        const acknowledgedIds = new Set<string>();
        let failed = 0;

        for (const item of eligible) {
            assertLockHeld();
            try {
                await this.acknowledge(ctx, pipelineId, item);
            } catch (error) {
                failed++;
                this.logger.warn('Remote source acknowledgement remains pending', {
                    pipelineId: String(pipelineId),
                    runId: item.acknowledgement.runId,
                    stepKey: item.stepKey,
                    adapterCode: item.acknowledgement.adapterCode,
                    sourcePath: item.acknowledgement.sourcePath,
                    error: getErrorMessage(error),
                });
                continue;
            }
            assertLockHeld();
            acknowledgedIds.add(item.acknowledgement.id);
        }

        if (acknowledgedIds.size > 0) {
            assertLockHeld();
            await this.removeAcknowledged(
                ctx,
                pipelineId,
                acknowledgedIds,
                eligible,
            );
        }

        return {
            acknowledged: acknowledgedIds.size,
            failed,
            pending: pending.length - acknowledgedIds.size,
        };
    }

    private collectPending(data: JsonObject | undefined): PendingAcknowledgement[] {
        if (!data) return [];
        const pending: PendingAcknowledgement[] = [];
        for (const [stepKey, value] of Object.entries(data)) {
            const stepCheckpoint = this.asJsonObject(value);
            if (!stepCheckpoint) continue;
            for (const acknowledgement of readRemoteSourceAcknowledgements(stepCheckpoint)) {
                pending.push({ stepKey, acknowledgement });
            }
        }
        return pending;
    }

    private async findCompletedRunIds(
        ctx: RequestContext,
        pipelineId: ID,
        runIds: string[],
    ): Promise<Set<string>> {
        const uniqueRunIds = [...new Set(runIds)];
        if (uniqueRunIds.length === 0) return new Set();
        const runs = await this.connection.getRepository(ctx, PipelineRun).find({
            where: {
                id: In(uniqueRunIds),
                pipelineId,
                status: RunStatus.COMPLETED,
                channelId: String(ctx.channelId),
            },
            select: { id: true },
        });
        return new Set(runs.map(run => String(run.id)));
    }

    private async acknowledge(
        ctx: RequestContext,
        pipelineId: ID,
        pending: PendingAcknowledgement,
    ): Promise<void> {
        const context = this.createExtractorContext(
            ctx,
            pipelineId,
            pending.stepKey,
            pending.acknowledgement.runId,
        );
        if (pending.acknowledgement.adapterCode === 's3') {
            await this.acknowledgeS3(
                context,
                pending.acknowledgement,
                pending.acknowledgement.config as unknown as S3ExtractorConfig,
            );
            return;
        }
        await this.acknowledgeFtp(
            context,
            pending.acknowledgement,
            pending.acknowledgement.config as unknown as FtpExtractorConfig,
        );
    }

    private async acknowledgeS3(
        context: ExtractorContext,
        acknowledgement: RemoteSourceAcknowledgement,
        config: S3ExtractorConfig,
    ): Promise<void> {
        const client = await createS3Client(context, config);
        try {
            if (acknowledgement.action === 'DELETE') {
                await client.deleteObject(acknowledgement.sourcePath);
                return;
            }

            const destination = this.requireDestination(acknowledgement);
            if (await this.s3ObjectExists(client, acknowledgement.sourcePath)) {
                await client.copyObject(acknowledgement.sourcePath, destination);
                await client.deleteObject(acknowledgement.sourcePath);
                return;
            }
            if (!await this.s3ObjectExists(client, destination)) {
                throw new Error('Neither the source nor destination S3 object exists');
            }
        } finally {
            await client.close();
        }
    }

    private async acknowledgeFtp(
        context: ExtractorContext,
        acknowledgement: RemoteSourceAcknowledgement,
        config: FtpExtractorConfig,
    ): Promise<void> {
        const client = await createClient(context, config);
        try {
            const sourceExists = await this.ftpFileExists(
                client,
                acknowledgement.sourcePath,
            );
            if (acknowledgement.action === 'DELETE') {
                if (sourceExists) {
                    await client.delete(acknowledgement.sourcePath);
                }
                return;
            }

            const destination = this.requireDestination(acknowledgement);
            if (sourceExists) {
                await client.rename(acknowledgement.sourcePath, destination);
                return;
            }
            if (!await this.ftpFileExists(client, destination)) {
                throw new Error('Neither the source nor destination FTP/SFTP file exists');
            }
        } finally {
            await client.close();
        }
    }

    private async s3ObjectExists(client: S3Client, key: string): Promise<boolean> {
        const result = await client.listObjects(key);
        return result.objects.some(object => object.key === key);
    }

    private async ftpFileExists(client: FtpClient, remotePath: string): Promise<boolean> {
        const directory = path.dirname(remotePath);
        const filename = path.basename(remotePath);
        const files = await client.list(directory);
        return files.some(file =>
            file.path === remotePath || (!file.isDirectory && file.name === filename),
        );
    }

    private requireDestination(
        acknowledgement: RemoteSourceAcknowledgement,
    ): string {
        if (!acknowledgement.destinationPath) {
            throw new Error('Remote source move acknowledgement has no destination');
        }
        return acknowledgement.destinationPath;
    }

    private createExtractorContext(
        ctx: RequestContext,
        pipelineId: ID,
        stepKey: string,
        runId: string,
    ): ExtractorContext {
        return {
            ctx,
            pipelineId,
            runId,
            stepKey,
            checkpoint: { data: {} },
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(this.connectionService, ctx),
            logger: createLoggerAdapter(this.logger),
            dryRun: false,
            setCheckpoint: () => undefined,
            isCancelled: async () => false,
        };
    }

    private async removeAcknowledged(
        ctx: RequestContext,
        pipelineId: ID,
        acknowledgementIds: ReadonlySet<string>,
        eligible: PendingAcknowledgement[],
    ): Promise<void> {
        const acknowledgedS3Sources = new Map<string, Set<string>>();
        for (const item of eligible) {
            if (!acknowledgementIds.has(item.acknowledgement.id)
                || item.acknowledgement.adapterCode !== 's3') {
                continue;
            }
            const sources = acknowledgedS3Sources.get(item.stepKey) ?? new Set<string>();
            sources.add(item.acknowledgement.sourcePath);
            acknowledgedS3Sources.set(item.stepKey, sources);
        }
        await this.checkpointService.updateForPipeline(ctx, pipelineId, current => {
            for (const [stepKey, value] of Object.entries(current)) {
                const stepCheckpoint = this.asJsonObject(value);
                if (!stepCheckpoint) continue;
                const next = removeRemoteSourceAcknowledgements(
                    stepCheckpoint,
                    acknowledgementIds,
                );
                const stepSources = acknowledgedS3Sources.get(stepKey);
                if (stepSources && Array.isArray(next.processedS3Keys)) {
                    next.processedS3Keys = next.processedS3Keys.filter(
                        key => typeof key !== 'string' || !stepSources.has(key),
                    );
                }
                current[stepKey] = next as JsonValue;
            }
            return current;
        });
    }

    private asJsonObject(value: JsonValue | undefined): JsonObject | undefined {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as JsonObject
            : undefined;
    }
}
