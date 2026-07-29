import type {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import type { PipelineDefinition } from '../../types';
import { RevisionType } from '../../constants/enums';
import {
    clonePipelineDefinition,
    PublishedPipelineRevisionUnavailableError,
} from './pipeline-policy';

export async function loadPublishedPipelineDefinition(
    connection: TransactionalConnection,
    ctx: RequestContext,
    pipeline: Pipeline,
    revisionId: ID | null | undefined = pipeline.currentRevisionId,
): Promise<PipelineDefinition> {
    if (revisionId == null) {
        throw new PublishedPipelineRevisionUnavailableError(pipeline.code, null);
    }

    const revision = await connection.getRepository(ctx, PipelineRevision).findOne({
        where: {
            id: revisionId,
            pipelineId: pipeline.id,
            type: RevisionType.PUBLISHED,
        },
    });
    if (!revision) {
        throw new PublishedPipelineRevisionUnavailableError(
            pipeline.code,
            revisionId,
        );
    }
    return clonePipelineDefinition(revision.definition);
}
