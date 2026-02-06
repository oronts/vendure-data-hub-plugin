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
        return repo.findOne({ where: { pipeline: { id: pipelineId } } });
    }

    async setForPipeline(ctx: RequestContext, pipelineId: ID, data: JsonObject): Promise<DataHubCheckpoint> {
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);

        const cp = await this.getByPipeline(ctx, pipelineId);
        if (cp) {
            cp.data = data;
            return repo.save(cp);
        }

        const entity = new DataHubCheckpoint();
        entity.pipeline = pipeline;
        entity.data = data;
        return repo.save(entity);
    }

    async clearForPipeline(ctx: RequestContext, pipelineId: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, DataHubCheckpoint);
        const cp = await this.getByPipeline(ctx, pipelineId);
        if (cp) {
            await repo.remove(cp);
        }
    }
}

