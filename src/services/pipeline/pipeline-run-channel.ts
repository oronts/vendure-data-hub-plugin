import {
    RequestContext,
    RequestContextService,
} from '@vendure/core';
import { PipelineRun } from '../../entities/pipeline';

export interface PipelineRunChannel {
    channelId: string;
    channelToken: string;
}

export function getActivePipelineRunChannelId(ctx: RequestContext): string {
    const channelId = ctx.channelId;
    if (
        (typeof channelId !== 'string' && typeof channelId !== 'number')
        || String(channelId).trim().length === 0
    ) {
        throw new Error('Data Hub run access requires an active Vendure channel');
    }
    return String(channelId);
}

export function getPipelineRunChannel(ctx: RequestContext): PipelineRunChannel {
    const channelId = getActivePipelineRunChannelId(ctx);
    const channelToken = ctx.channel?.token;

    if (
        typeof channelToken !== 'string'
        || channelToken.trim().length === 0
    ) {
        throw new Error('Pipeline execution requires an active Vendure channel');
    }

    return {
        channelId,
        channelToken,
    };
}

export async function createPipelineRunContext(
    requestContextService: RequestContextService,
    run: PipelineRun,
): Promise<RequestContext> {
    if (!run.channelId || !run.channelToken) {
        throw new Error(
            `Pipeline run ${String(run.id)} has no persisted execution channel`,
        );
    }

    const ctx = await requestContextService.create({
        apiType: 'admin',
        channelOrToken: run.channelToken,
    });

    if (String(ctx.channelId) !== run.channelId) {
        throw new Error(
            `Pipeline run ${String(run.id)} channel mismatch: expected ${run.channelId}, resolved ${String(ctx.channelId)}`,
        );
    }

    return ctx;
}
