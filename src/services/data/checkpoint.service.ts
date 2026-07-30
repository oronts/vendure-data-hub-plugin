import { Injectable, Optional } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubCheckpoint } from '../../entities/data';
import { Pipeline } from '../../entities/pipeline';
import type { JsonObject } from '../../types/index';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import { deepClone } from '../../utils/object-path.utils';
import { DISTRIBUTED_LOCK } from '../../constants/defaults/reliability-defaults';
import { DistributedLockService } from '../runtime/distributed-lock.service';

export type CheckpointUpdater = (current: JsonObject) => JsonObject;

@Injectable()
export class CheckpointService {
    constructor(
        private connection: TransactionalConnection,
        @Optional() private distributedLock?: DistributedLockService,
    ) {}

    async getByPipeline(ctx: RequestContext, pipelineId: ID): Promise<DataHubCheckpoint | null> {
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        return repo.findOne({
            where: {
                pipelineId,
                pipeline: { channels: { id: ctx.channelId } },
            },
            relations: { pipeline: true },
        });
    }

    async setForPipeline(ctx: RequestContext, pipelineId: ID, data: JsonObject): Promise<DataHubCheckpoint> {
        return this.withPipelineLock(
            pipelineId,
            () => this.writeForPipeline(ctx, pipelineId, data),
        );
    }

    async updateForPipeline(
        ctx: RequestContext,
        pipelineId: ID,
        updater: CheckpointUpdater,
    ): Promise<DataHubCheckpoint> {
        return this.withPipelineLock(pipelineId, async () => {
            const existing = await this.getByPipeline(ctx, pipelineId);
            const current = deepClone(existing?.data ?? {});
            return this.writeForPipeline(ctx, pipelineId, updater(current));
        });
    }

    private async writeForPipeline(
        ctx: RequestContext,
        pipelineId: ID,
        data: JsonObject,
    ): Promise<DataHubCheckpoint> {
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        const pipeline = await this.connection.getEntityOrThrow(
            ctx,
            Pipeline,
            pipelineId,
            { channelId: ctx.channelId },
        );

        const existing = await repo.findOne({ where: { pipelineId } });
        if (existing) {
            existing.data = data;
            return repo.save(existing);
        }

        const entity = new DataHubCheckpoint();
        entity.pipeline = pipeline;
        entity.data = data;
        try {
            return await repo.save(entity);
        } catch (error) {
            if (!isDuplicateEntryError(getErrorMessage(error))) {
                throw error;
            }
            const winner = await repo.findOne({ where: { pipelineId } });
            if (!winner) {
                throw error;
            }
            winner.data = data;
            return repo.save(winner);
        }
    }

    async clearForPipeline(ctx: RequestContext, pipelineId: ID): Promise<void> {
        await this.withPipelineLock(pipelineId, async () => {
            const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
            const checkpoint = await repo.findOne({
                where: {
                    pipelineId,
                    pipeline: { channels: { id: ctx.channelId } },
                },
            });
            if (checkpoint) {
                await repo.remove(checkpoint);
            }
        });
    }

    private async withPipelineLock<T>(pipelineId: ID, action: () => Promise<T>): Promise<T> {
        if (!this.distributedLock) {
            return action();
        }
        const key = `${DISTRIBUTED_LOCK.CHECKPOINT_LOCK_PREFIX}${String(pipelineId)}`;
        const lock = await this.distributedLock.acquire(key, {
            ttlMs: DISTRIBUTED_LOCK.CHECKPOINT_LOCK_TTL_MS,
            waitForLock: true,
            waitTimeoutMs: DISTRIBUTED_LOCK.CHECKPOINT_LOCK_WAIT_TIMEOUT_MS,
        });
        if (!lock.acquired || !lock.token) {
            throw new Error(`Could not acquire checkpoint lock for pipeline ${String(pipelineId)}`);
        }
        try {
            return await action();
        } finally {
            await this.distributedLock.release(key, lock.token);
        }
    }
}
