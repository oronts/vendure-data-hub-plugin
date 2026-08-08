import { describe, expect, it, vi } from 'vitest';
import type { DataHubLogger } from '../../services/logger/datahub-logger';
import { handleCollectionFilters } from './helpers';

describe('collection filter modes', () => {
    it('deduplicates identical filters during merge', async () => {
        const collectionService = {
            findOne: vi.fn(async () => ({
                filters: [{
                    code: 'variant-name-filter',
                    args: [
                        { name: 'operator', value: 'contains' },
                        { name: 'term', value: 'Glove' },
                        { name: 'combineWithAnd', value: 'true' },
                    ],
                }],
            })),
        };
        const logger = { debug: vi.fn() } as unknown as DataHubLogger;

        const result = await handleCollectionFilters(
            {} as never,
            collectionService as never,
            1,
            [{ code: 'variant-name-filter', args: { operator: 'contains', term: 'Glove' } }],
            'MERGE',
            logger,
        );

        expect(result).toEqual([{
            code: 'variant-name-filter',
            arguments: [
                { name: 'operator', value: 'contains' },
                { name: 'term', value: 'Glove' },
                { name: 'combineWithAnd', value: 'true' },
            ],
        }]);
    });

    it('retains distinct filter arguments during merge', async () => {
        const collectionService = {
            findOne: vi.fn(async () => ({
                filters: [{
                    code: 'variant-name-filter',
                    args: [{ name: 'operator', value: 'contains' }, { name: 'term', value: 'Red' }],
                }],
            })),
        };

        const result = await handleCollectionFilters(
            {} as never,
            collectionService as never,
            1,
            [{ code: 'variant-name-filter', args: { operator: 'contains', term: 'Blue' } }],
            'MERGE',
            { debug: vi.fn() } as unknown as DataHubLogger,
        );

        expect(result).toHaveLength(2);
    });
});
