import type { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { In, IsNull, Not } from 'typeorm';
import { PipelineStatus, RevisionType } from '../../constants/enums';
import { SCHEDULER } from '../../constants';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import type { PipelineDefinition } from '../../types';
import { PublishedPipelineRevisionUnavailableError } from './pipeline-policy';

export interface ActivePipelineDefinition {
    readonly id: ID;
    readonly code: string;
    readonly revisionId: ID;
    readonly definition: PipelineDefinition;
}

interface PipelineRevisionPointer {
    readonly id: ID;
    readonly code: string;
    readonly currentRevisionId: ID | null;
}

async function hydratePublishedDefinitions(
    connection: TransactionalConnection,
    ctx: RequestContext,
    pipelines: readonly PipelineRevisionPointer[],
): Promise<ActivePipelineDefinition[]> {
    const revisionIds = pipelines
        .map(item => item.currentRevisionId)
        .filter((id): id is NonNullable<typeof id> => id != null);
    if (revisionIds.length === 0) {
        return [];
    }

    const revisions = await connection.getRepository(ctx, PipelineRevision).find({
        where: {
            id: In(revisionIds),
            pipelineId: In(pipelines.map(pipeline => pipeline.id)),
            type: RevisionType.PUBLISHED,
        },
        select: { id: true, pipelineId: true, definition: true },
    });
    const revisionsById = new Map(
        revisions.map(revision => [
            String(revision.id),
            { pipelineId: revision.pipelineId, definition: revision.definition },
        ]),
    );
    const missingRevision = pipelines.find(pipeline => (
        pipeline.currentRevisionId != null
        && (
            !revisionsById.has(String(pipeline.currentRevisionId))
            || String(revisionsById.get(String(pipeline.currentRevisionId))?.pipelineId) !== String(pipeline.id)
        )
    ));
    if (missingRevision) {
        throw new PublishedPipelineRevisionUnavailableError(
            missingRevision.code,
            missingRevision.currentRevisionId,
        );
    }

    return pipelines.map(pipeline => ({
        id: pipeline.id,
        code: pipeline.code,
        revisionId: pipeline.currentRevisionId!,
        definition: revisionsById.get(String(pipeline.currentRevisionId))!.definition,
    }));
}

export async function loadActivePipelineDefinitions(
    connection: TransactionalConnection,
    ctx: RequestContext,
): Promise<ActivePipelineDefinition[]> {
    return loadActivePipelineDefinitionsWithScope(connection, ctx, false);
}

export async function loadActivePipelineDefinitionsAcrossChannels(
    connection: TransactionalConnection,
    ctx: RequestContext,
): Promise<ActivePipelineDefinition[]> {
    return loadActivePipelineDefinitionsWithScope(connection, ctx, true);
}

async function loadActivePipelineDefinitionsWithScope(
    connection: TransactionalConnection,
    ctx: RequestContext,
    acrossChannels: boolean,
): Promise<ActivePipelineDefinition[]> {
    const pipelines = await connection.getRepository(ctx, Pipeline).find({
        where: {
            currentRevisionId: Not(IsNull()),
            ...(acrossChannels ? {} : { channels: { id: ctx.channelId } }),
        },
        select: { id: true, code: true, currentRevisionId: true },
        take: SCHEDULER.MAX_PIPELINE_DISCOVERY + 1,
    });
    if (pipelines.length > SCHEDULER.MAX_PIPELINE_DISCOVERY) {
        throw new Error(
            `Active pipeline discovery exceeded the safe limit of ${SCHEDULER.MAX_PIPELINE_DISCOVERY}`,
        );
    }
    return hydratePublishedDefinitions(connection, ctx, pipelines);
}

export async function loadRunnablePipelineDefinitions(
    connection: TransactionalConnection,
    ctx: RequestContext,
    limit: number = SCHEDULER.MAX_PIPELINE_DISCOVERY,
): Promise<ActivePipelineDefinition[]> {
    const pipelines = await connection.getRepository(ctx, Pipeline).find({
        where: {
            enabled: true,
            status: Not(PipelineStatus.ARCHIVED),
            currentRevisionId: Not(IsNull()),
            channels: { id: ctx.channelId },
        },
        select: { id: true, code: true, currentRevisionId: true },
        order: { id: 'ASC' },
        take: limit + 1,
    });
    if (pipelines.length > limit) {
        throw new Error(
            `Runnable pipeline discovery exceeded the safe limit of ${limit}`,
        );
    }
    return hydratePublishedDefinitions(connection, ctx, pipelines);
}

export async function loadRunnablePipelineDefinitionByCode(
    connection: TransactionalConnection,
    ctx: RequestContext,
    code: string,
): Promise<ActivePipelineDefinition | null> {
    const pipeline = await connection.getRepository(ctx, Pipeline).findOne({
        where: {
            code,
            enabled: true,
            status: Not(PipelineStatus.ARCHIVED),
            currentRevisionId: Not(IsNull()),
            channels: { id: ctx.channelId },
        },
        select: { id: true, code: true, currentRevisionId: true },
    });
    if (!pipeline) return null;
    return (await hydratePublishedDefinitions(connection, ctx, [pipeline]))[0] ?? null;
}
