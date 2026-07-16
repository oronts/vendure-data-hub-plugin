import { describe, expect, it } from 'vitest';
import { GraphQLPaginationType } from '../../constants/enums';
import {
    extractGraphqlResponseRecords,
    extractRecords,
    initPaginationState,
    updatePaginationState,
} from './helpers';

describe('GraphQL extractor response contract', () => {
    it('resolves the documented full response dataPath', () => {
        const response = {
            data: {
                products: {
                    items: [{ id: '1' }, { id: '2' }],
                },
            },
        };

        expect(extractRecords(response, 'data.products.items')).toEqual([
            { id: '1' },
            { id: '2' },
        ]);
    });

    it('uses the GraphQL data envelope when dataPath is omitted', () => {
        const response = {
            data: {
                items: [{ id: '1' }],
            },
        };

        expect(extractGraphqlResponseRecords(response)).toEqual([{ id: '1' }]);
    });

    it('resolves Relay page info from the full response', () => {
        const result = updatePaginationState(
            {
                type: GraphQLPaginationType.RELAY,
                limit: 2,
                pageInfoPath: 'data.products.pageInfo',
            },
            {
                data: {
                    products: {
                        pageInfo: {
                            hasNextPage: true,
                            endCursor: 'cursor-2',
                        },
                    },
                },
            },
            initPaginationState(),
            2,
        );

        expect(result.hasMore).toBe(true);
        expect(result.state.cursor).toBe('cursor-2');
    });
});
