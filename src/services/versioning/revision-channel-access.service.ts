import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { RevisionType } from '../../constants/enums';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';

export class RevisionChannelAccessService {
    constructor(private readonly connection: TransactionalConnection) {}

    findPipeline(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<Pipeline | undefined> {
        return this.connection.findOneInChannel(
            ctx,
            Pipeline,
            pipelineId,
            ctx.channelId,
        );
    }

    async getPipeline(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<Pipeline> {
        const pipeline = await this.findPipeline(ctx, pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline ${String(pipelineId)} not found`);
        }
        return pipeline;
    }

    async getRevision(
        ctx: RequestContext,
        revisionId: ID,
        type?: RevisionType,
    ): Promise<PipelineRevision | null> {
        const revision = await this.connection
            .getRepository(ctx, PipelineRevision)
            .findOne({
                where: {
                    id: revisionId,
                    ...(type === undefined ? {} : { type }),
                },
            });
        if (!revision) return null;
        const pipeline = await this.findPipeline(
            ctx,
            revision.pipelineId,
        );
        return pipeline ? revision : null;
    }
}
