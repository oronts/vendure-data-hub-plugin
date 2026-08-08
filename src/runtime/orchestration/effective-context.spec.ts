import type { RequestContext } from '@vendure/core';
import { describe, expect, it } from 'vitest';
import { resolveEffectiveStepContext } from './effective-context';

describe('resolveEffectiveStepContext', () => {
    const ctx = {
        channelId: 'active-channel',
        languageCode: 'de',
    } as RequestContext;

    it('merges request, pipeline, and step defaults in precedence order', () => {
        expect(resolveEffectiveStepContext(
            ctx,
            {
                contentLanguage: 'en',
                channelStrategy: 'MULTI',
                channelIds: ['pipeline-channel'],
                validationMode: 'LENIENT',
                throughput: { batchSize: 50, concurrency: 2 },
            },
            {
                contentLanguage: 'fr',
                channelIds: ['step-channel'],
                validationMode: 'STRICT',
                throughput: { concurrency: 4 },
            },
        )).toEqual({
            contentLanguage: 'fr',
            channelStrategy: 'MULTI',
            channelIds: ['step-channel'],
            validationMode: 'STRICT',
            throughput: { batchSize: 50, concurrency: 4 },
        });
    });

    it('uses the active request channel and language when no defaults exist', () => {
        expect(resolveEffectiveStepContext(ctx, undefined, undefined)).toEqual({
            contentLanguage: 'de',
            channelStrategy: 'INHERIT',
            channelIds: ['active-channel'],
            validationMode: 'STRICT',
            throughput: {},
        });
    });

    it('preserves an explicit empty channel override for validation to reject', () => {
        expect(resolveEffectiveStepContext(
            ctx,
            { channelIds: ['pipeline-channel'] },
            { channelStrategy: 'EXPLICIT', channelIds: [] },
        ).channelIds).toEqual([]);
    });

    it('does not retain the source channel ID for a target channel token', () => {
        expect(resolveEffectiveStepContext(
            ctx,
            { channel: 'target-token' },
            undefined,
        )).not.toHaveProperty('channelIds');
    });
});
