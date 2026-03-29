import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubCheckpoint } from '../../entities/data';
import { Pipeline } from '../../entities/pipeline';
import type { JsonObject } from '../../types/index';

@Injectable()
export class CheckpointService {
    constructor(private connection: TransactionalConnection) {}

    async getByPipeline(ctx: RequestContext, pipelineId: ID): Promise<DataHubCheckpoint | null> {
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        return repo.findOne({ where: { pipeline: { id: pipelineId } }, relations: { pipeline: true }, order: { createdAt: 'DESC' } });
    }

    async setForPipeline(ctx: RequestContext, pipelineId: ID, data: JsonObject): Promise<DataHubCheckpoint> {
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);

        // Find all checkpoints for this pipeline, update the latest, remove duplicates
        const all = await repo.find({ where: { pipeline: { id: pipelineId } }, order: { createdAt: 'DESC' } });
        if (all.length > 0) {
            const [latest, ...duplicates] = all;
            latest.data = data;
            if (duplicates.length > 0) {
                await repo.remove(duplicates);
            }
            return repo.save(latest);
        }

        const entity = new DataHubCheckpoint();
        entity.pipeline = pipeline;
        entity.data = data;
        return repo.save(entity);
    }

    async clearForPipeline(ctx: RequestContext, pipelineId: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        // Remove ALL checkpoints for this pipeline (handles duplicates)
        const all = await repo.find({ where: { pipeline: { id: pipelineId } } });
        if (all.length > 0) {
            await repo.remove(all);
        }
    }
}
