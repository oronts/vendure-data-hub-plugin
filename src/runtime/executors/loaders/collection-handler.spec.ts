import { describe, expect, it, vi } from 'vitest';
import type {
    ChannelService,
    CollectionService,
    RequestContext,
    RequestContextService,
} from '@vendure/core';
import type { PipelineStepDefinition } from '../../../types';
import type { DataHubLoggerFactory } from '../../../services/logger';
import { CollectionHandler } from './collection-handler';

describe('CollectionHandler simulation', () => {
    it('uses translation identity fallback before deciding the operation', async () => {
        const findOneBySlug = vi.fn(async () => undefined);
        const loggerFactory = {
            createLogger: vi.fn(() => ({})),
        } as unknown as DataHubLoggerFactory;
        const handler = new CollectionHandler(
            { findOneBySlug } as unknown as CollectionService,
            {} as RequestContextService,
            {} as ChannelService,
            loggerFactory,
        );
        const step = {
            key: 'collection',
            type: 'LOAD',
            config: {
                adapterCode: 'collectionUpsert',
                translationsField: 'translations',
            },
        } as PipelineStepDefinition;

        const result = await handler.simulate(
            {} as RequestContext,
            step,
            [{
                translations: {
                    en: { name: 'Summer Collection', slug: 'summer-collection' },
                },
            }],
        );

        expect(findOneBySlug).toHaveBeenCalledWith(
            expect.anything(),
            'summer-collection',
        );
        expect(result.recordDetails[0]).toMatchObject({
            recordId: 'summer-collection',
            operation: 'CREATE',
            validationErrors: [],
        });
    });
});
