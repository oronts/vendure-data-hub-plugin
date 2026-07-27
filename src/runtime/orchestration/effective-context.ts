import type { RequestContext } from '@vendure/core';
import {
    PipelineContext,
} from '../../types/index';
import type { StepContextOverride } from '../../../shared/types';

function selectedChannelIds(
    ctx: RequestContext,
    pipelineContext: PipelineContext,
    stepContext: StepContextOverride,
): string[] | undefined {
    const configured = stepContext.channelIds !== undefined
        ? stepContext.channelIds
        : pipelineContext.channelIds;
    if (configured !== undefined) {
        return [...configured];
    }
    if (pipelineContext.channel !== undefined) {
        return undefined;
    }
    return ctx.channelId === undefined || ctx.channelId === null
        ? []
        : [String(ctx.channelId)];
}

export function resolveEffectiveStepContext(
    ctx: RequestContext,
    pipelineContext: PipelineContext | undefined,
    stepContext: StepContextOverride | undefined,
): PipelineContext {
    const pipeline = pipelineContext ?? {};
    const step = stepContext ?? {};
    const requestLanguage = ctx.languageCode === undefined || ctx.languageCode === null
        ? undefined
        : String(ctx.languageCode);
    const channelIds = selectedChannelIds(ctx, pipeline, step);
    return {
        ...pipeline,
        ...step,
        contentLanguage: step.contentLanguage
            ?? pipeline.contentLanguage
            ?? requestLanguage,
        channelStrategy: step.channelStrategy
            ?? pipeline.channelStrategy
            ?? 'INHERIT',
        ...(channelIds === undefined ? {} : { channelIds }),
        validationMode: step.validationMode
            ?? pipeline.validationMode
            ?? 'STRICT',
        throughput: {
            ...pipeline.throughput,
            ...step.throughput,
        },
    };
}
