import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubCheckpoint } from '../../entities/data';
import { Pipeline } from '../../entities/pipeline';
import type { JsonObject } from '../../types/index';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';

@Injectable()
export class CheckpointService {
    constructor(private connection: TransactionalConnection) {}

    async getByPipeline(ctx: RequestContext, pipelineId: ID): Promise<DataHubCheckpoint | null> {
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        return repo.findOne({
            where: { pipelineId },
            relations: { pipeline: true },
        });
    }

    async setForPipeline(ctx: RequestContext, pipelineId: ID, data: JsonObject): Promise<DataHubCheckpoint> {
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);

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
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        const checkpoint = await repo.findOne({ where: { pipelineId } });
        if (checkpoint) {
            await repo.remove(checkpoint);
        }
    }
}
