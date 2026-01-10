import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { PipelineCheckpointEntity } from '../../entities/data';
import { Pipeline } from '../../entities/pipeline';

@Injectable()
export class CheckpointService {
    constructor(private connection: TransactionalConnection) {}

    async getByPipeline(ctx: RequestContext, pipelineId: ID): Promise<PipelineCheckpointEntity | null> {
        const repo = this.connection.getRepository(ctx, PipelineCheckpointEntity);
        return repo.findOne({ where: { pipeline: { id: pipelineId } as any } });
    }

    async setForPipeline(ctx: RequestContext, pipelineId: ID, data: Record<string, any>): Promise<PipelineCheckpointEntity> {
        const repo = this.connection.getRepository(ctx, PipelineCheckpointEntity);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);
        let cp = await this.getByPipeline(ctx, pipelineId);
        if (!cp) {
            const entity = new PipelineCheckpointEntity();
            entity.pipeline = pipeline;
            entity.data = data;
            cp = await repo.save(entity);
            return cp;
        }
        cp.data = data;
        await repo.save(cp, { reload: false });
        return (await this.getByPipeline(ctx, pipelineId))!;
    }

    /**
     * Clear checkpoint data for a pipeline.
     * Used when starting a fresh run (not resuming).
     */
    async clearForPipeline(ctx: RequestContext, pipelineId: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, PipelineCheckpointEntity);
        const cp = await this.getByPipeline(ctx, pipelineId);
        if (cp) {
            await repo.remove(cp);
        }
    }
}

