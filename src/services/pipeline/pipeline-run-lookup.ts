import type {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { PipelineRun } from '../../entities/pipeline';
import { getActivePipelineRunChannelId } from './pipeline-run-channel';

export function findPipelineRunInActiveChannel(
    connection: TransactionalConnection,
    ctx: RequestContext,
    id: ID,
): Promise<PipelineRun | null> {
    return connection.getRepository(ctx, PipelineRun).findOne({
        where: {
            id,
            channelId: getActivePipelineRunChannelId(ctx),
        },
        relations: { pipeline: true },
    });
}
