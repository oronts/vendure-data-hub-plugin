import type { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { In, IsNull, Not } from 'typeorm';
import { RevisionType } from '../../constants/enums';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import type { PipelineDefinition } from '../../types';

export interface ActivePipelineDefinition {
    readonly id: ID;
    readonly code: string;
    readonly definition: PipelineDefinition;
}

export async function loadActivePipelineDefinitions(
    connection: TransactionalConnection,
    ctx: RequestContext,
): Promise<ActivePipelineDefinition[]> {
    const pipelines = await connection.getRepository(ctx, Pipeline).find({
        where: { currentRevisionId: Not(IsNull()) },
        select: { id: true, code: true, currentRevisionId: true },
    });
    const revisionIds = pipelines
        .map(item => item.currentRevisionId)
        .filter((id): id is NonNullable<typeof id> => id != null);
    if (revisionIds.length === 0) {
        return [];
    }

    const revisions = await connection.getRepository(ctx, PipelineRevision).find({
        where: {
            id: In(revisionIds),
            type: RevisionType.PUBLISHED,
        },
        select: { id: true, definition: true },
    });
    const revisionsById = new Map(
        revisions.map(revision => [String(revision.id), revision.definition]),
    );
    const missingRevision = pipelines.find(pipeline => (
        pipeline.currentRevisionId != null
        && !revisionsById.has(String(pipeline.currentRevisionId))
    ));
    if (missingRevision) {
        throw new Error(
            `Cannot load active pipeline definitions because the published revision for pipeline "${missingRevision.code}" is missing`,
        );
    }

    return pipelines.map(pipeline => ({
        id: pipeline.id,
        code: pipeline.code,
        definition: revisionsById.get(String(pipeline.currentRevisionId))!,
    }));
}
