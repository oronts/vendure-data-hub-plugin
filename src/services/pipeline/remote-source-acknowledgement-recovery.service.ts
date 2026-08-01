import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
    ChannelService,
    ID,
    Job,
    JobQueue,
    JobQueueService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import {
    DISTRIBUTED_LOCK,
    LOGGER_CONTEXTS,
    QUEUE_NAMES,
    REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY,
} from '../../constants';
import { RunStatus } from '../../constants/enums';
import { DataHubCheckpoint } from '../../entities/data';
import { PipelineRun } from '../../entities/pipeline';
import { readRemoteSourceAcknowledgements } from '../../extractors/shared/remote-source-acknowledgement';
import type { JsonObject, JsonValue } from '../../types';
import { chunk } from '../../utils/array.utils';
import { ensureError } from '../../utils/error.utils';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { RemoteSourceAcknowledgementService } from './remote-source-acknowledgement.service';

interface RemoteSourceAcknowledgementCandidate {
    pipelineId: string;
    channelId: string;
}

interface RemoteSourceAcknowledgementJobData
extends RemoteSourceAcknowledgementCandidate {
    dispatchToken: string;
}

@Injectable()
export class RemoteSourceAcknowledgementRecoveryService
implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private queue!: JobQueue<RemoteSourceAcknowledgementJobData>;
    private recoveryTimer: NodeJS.Timeout | null = null;
    private recoveryCursor: ID | null = null;
    private reconciliation: Promise<void> | null = null;
    private leaderToken: string | null = null;
    private leaderRefreshTimer: NodeJS.Timeout | null = null;
    private leaderRefresh: Promise<void> | null = null;
    private destroying = false;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        private readonly channelService: ChannelService,
        private readonly jobQueueService: JobQueueService,
        private readonly acknowledgements: RemoteSourceAcknowledgementService,
        private readonly distributedLock: DistributedLockService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(
            LOGGER_CONTEXTS.REMOTE_SOURCE_ACKNOWLEDGEMENT,
        );
    }

    async onModuleInit(): Promise<void> {
        this.queue = await this.jobQueueService.createQueue({
            name: QUEUE_NAMES.REMOTE_SOURCE_ACKNOWLEDGEMENT,
            process: job => this.processRecoveryJob(job),
        });
        await this.runReconciliation('Initial');
        this.recoveryTimer = setInterval(() => {
            void this.runReconciliation('Scheduled');
        }, REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY.RECONCILE_INTERVAL_MS);
        this.recoveryTimer.unref();
    }

    async onModuleDestroy(): Promise<void> {
        this.destroying = true;
        if (this.recoveryTimer) clearInterval(this.recoveryTimer);
        this.recoveryTimer = null;
        this.stopLeaderRefresh();
        await this.leaderRefresh;
        await this.reconciliation?.catch(() => undefined);
        if (this.leaderToken) {
            const token = this.leaderToken;
            this.leaderToken = null;
            await this.distributedLock.release(
                DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_KEY,
                token,
            );
        }
    }

    private async runReconciliation(source: 'Initial' | 'Scheduled'): Promise<void> {
        if (this.destroying || this.reconciliation) return;
        const reconciliation = this.runLeaderReconciliation(source);
        this.reconciliation = reconciliation;
        await reconciliation.finally(() => {
            if (this.reconciliation === reconciliation) {
                this.reconciliation = null;
            }
        });
    }

    private async runLeaderReconciliation(
        source: 'Initial' | 'Scheduled',
    ): Promise<void> {
        try {
            if (!await this.ensureLeadership() || this.destroying) return;
            const adminCtx = await this.requestContextService.create({ apiType: 'admin' });
            const checkpoints = await this.findCheckpointBatch(adminCtx);
            const candidates = await this.findRecoveryCandidates(adminCtx, checkpoints);
            if (!this.canDispatchRecovery()) return;
            await this.enqueueCandidates(candidates);
        } catch (error) {
            this.logger.error(
                `${source} remote source acknowledgement reconciliation failed`,
                ensureError(error),
            );
        }
    }

    private async ensureLeadership(): Promise<boolean> {
        const lockKey = DISTRIBUTED_LOCK
            .REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_KEY;
        const ttlMs = DISTRIBUTED_LOCK
            .REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_TTL_MS;
        if (this.leaderToken) return true;

        const lock = await this.distributedLock.acquire(lockKey, {
            ttlMs,
            waitForLock: false,
        });
        if (!lock.acquired || !lock.token) return false;
        this.leaderToken = lock.token;
        this.recoveryCursor = null;
        this.startLeaderRefresh();
        return true;
    }

    private startLeaderRefresh(): void {
        if (this.leaderRefreshTimer) return;
        this.leaderRefreshTimer = setInterval(() => {
            const token = this.leaderToken;
            if (!token || this.destroying || this.leaderRefresh) return;
            const refresh = this.refreshLeadership(token);
            this.leaderRefresh = refresh;
            void refresh.finally(() => {
                if (this.leaderRefresh === refresh) this.leaderRefresh = null;
            });
        }, REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY.RECONCILE_INTERVAL_MS);
        this.leaderRefreshTimer.unref();
    }

    private stopLeaderRefresh(): void {
        if (this.leaderRefreshTimer) clearInterval(this.leaderRefreshTimer);
        this.leaderRefreshTimer = null;
    }

    private async refreshLeadership(token: string): Promise<void> {
        try {
            const extended = await this.distributedLock.extend(
                DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_KEY,
                token,
                DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY_LOCK_TTL_MS,
            );
            if (extended) return;
            this.loseLeadership(token, 'lease renewal was rejected');
        } catch (error) {
            this.loseLeadership(token, ensureError(error).message);
        }
    }

    private loseLeadership(token: string, reason: string): void {
        if (this.leaderToken !== token) return;
        this.leaderToken = null;
        this.recoveryCursor = null;
        this.stopLeaderRefresh();
        this.logger.warn('Remote source acknowledgement recovery leadership was lost', {
            reason,
        });
    }

    private canDispatchRecovery(): boolean {
        return !this.destroying && this.leaderToken != null;
    }

    private async findRecoveryCandidates(
        ctx: RequestContext,
        checkpoints: DataHubCheckpoint[],
    ): Promise<RemoteSourceAcknowledgementCandidate[]> {
        const runIds = this.collectRunIds(checkpoints);
        if (runIds.length === 0) return [];
        const runRepository = this.connection.getRepository(ctx, PipelineRun);
        const runs: PipelineRun[] = [];
        for (const runIdBatch of chunk(
            runIds,
            REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY.RUN_ID_QUERY_BATCH_SIZE,
        )) {
            runs.push(...await runRepository.find({
                where: { id: In(runIdBatch), status: RunStatus.COMPLETED },
                select: {
                    id: true,
                    pipelineId: true,
                    channelId: true,
                },
            }));
        }
        const candidates = new Map<string, RemoteSourceAcknowledgementCandidate>();
        for (const run of runs) {
            const candidate = this.toRecoveryCandidate(run);
            if (!candidate) continue;
            candidates.set(`${candidate.pipelineId}\u0000${candidate.channelId}`, candidate);
        }
        return [...candidates.values()];
    }

    private collectRunIds(checkpoints: DataHubCheckpoint[]): string[] {
        const runIds = new Set<string>();
        for (const checkpoint of checkpoints) {
            for (const value of Object.values(checkpoint.data)) {
                const step = this.asJsonObject(value);
                if (!step) continue;
                for (const pending of readRemoteSourceAcknowledgements(step)) {
                    runIds.add(pending.runId);
                }
            }
        }
        return [...runIds];
    }

    private toRecoveryCandidate(
        run: PipelineRun,
    ): RemoteSourceAcknowledgementCandidate | null {
        if (!run.channelId) {
            this.logger.warn('Completed run cannot recover its remote source acknowledgement', {
                runId: String(run.id),
                pipelineId: String(run.pipelineId),
                reason: 'missing persisted channel context',
            });
            return null;
        }
        return {
            pipelineId: String(run.pipelineId),
            channelId: run.channelId,
        };
    }

    private async enqueueCandidates(
        candidates: RemoteSourceAcknowledgementCandidate[],
    ): Promise<void> {
        for (const candidate of candidates) {
            if (!this.canDispatchRecovery()) return;
            const dispatchKey = this.dispatchLockKey(candidate);
            const dispatch = await this.distributedLock.acquire(dispatchKey, {
                ttlMs: DISTRIBUTED_LOCK
                    .REMOTE_SOURCE_ACKNOWLEDGEMENT_DISPATCH_LOCK_TTL_MS,
                waitForLock: false,
            });
            if (!dispatch.acquired || !dispatch.token) continue;
            if (!this.canDispatchRecovery()) {
                await this.distributedLock.release(dispatchKey, dispatch.token);
                return;
            }
            try {
                await this.queue.add({
                    ...candidate,
                    dispatchToken: dispatch.token,
                }, {
                    retries: REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY.JOB_RETRIES,
                });
            } catch (error) {
                await this.distributedLock.release(dispatchKey, dispatch.token);
                throw error;
            }
        }
    }

    private async findCheckpointBatch(
        ctx: RequestContext,
    ): Promise<DataHubCheckpoint[]> {
        const query = this.connection.getRepository(ctx, DataHubCheckpoint)
            .createQueryBuilder('checkpoint')
            .select(['checkpoint.id', 'checkpoint.data'])
            .orderBy('checkpoint.id', 'ASC')
            .take(REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY.BATCH_SIZE);
        if (this.recoveryCursor != null) {
            query.where('checkpoint.id > :cursor', { cursor: this.recoveryCursor });
        }
        const checkpoints = await query.getMany();
        this.recoveryCursor = checkpoints.length
            === REMOTE_SOURCE_ACKNOWLEDGEMENT_RECOVERY.BATCH_SIZE
            ? checkpoints.at(-1)?.id ?? null
            : null;
        return checkpoints;
    }

    private async processRecoveryJob(
        job: Job<RemoteSourceAcknowledgementJobData>,
    ): Promise<void> {
        const adminCtx = await this.requestContextService.create({ apiType: 'admin' });
        const channel = await this.channelService.findOne(
            adminCtx,
            job.data.channelId,
        );
        if (!channel) {
            throw new Error(
                `Remote source acknowledgement channel ${job.data.channelId} no longer exists`,
            );
        }
        const ctx = await this.requestContextService.create({
            apiType: 'admin',
            channelOrToken: channel,
        });
        if (String(ctx.channelId) !== job.data.channelId) {
            throw new Error(
                `Remote source acknowledgement channel mismatch for pipeline ${job.data.pipelineId}`,
            );
        }
        const result = await this.acknowledgements.acknowledgeCompletedForPipeline(
            ctx,
            job.data.pipelineId,
        );
        if (result.failed > 0) {
            throw new Error(
                `${result.failed} remote source acknowledgement(s) remain pending for pipeline ${job.data.pipelineId}`,
            );
        }
        await this.distributedLock.release(
            this.dispatchLockKey(job.data),
            job.data.dispatchToken,
        );
    }

    private dispatchLockKey(
        candidate: RemoteSourceAcknowledgementCandidate,
    ): string {
        return [
            DISTRIBUTED_LOCK.REMOTE_SOURCE_ACKNOWLEDGEMENT_DISPATCH_LOCK_PREFIX,
            candidate.pipelineId,
            ':',
            candidate.channelId,
        ].join('');
    }

    private asJsonObject(value: JsonValue | undefined): JsonObject | undefined {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as JsonObject
            : undefined;
    }
}
