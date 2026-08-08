import { describe, expect, it } from 'vitest';
import {
    createPipelineSearchOptions,
    PIPELINE_SELECTOR_PAGE_SIZE,
} from './pipeline-list-options';
import { getNextListPageOffset } from './paginated-list';

describe('pipeline list options', () => {
    it('creates bounded server-side name and code search', () => {
        expect(createPipelineSearchOptions('  catalog  ')).toEqual({
            take: PIPELINE_SELECTOR_PAGE_SIZE,
            skip: 0,
            sort: { name: 'ASC' },
            filter: {
                name: { contains: 'catalog' },
                code: { contains: 'catalog' },
            },
            filterOperator: 'OR',
        });
    });

    it('omits the filter for an empty search', () => {
        expect(createPipelineSearchOptions('  ').filter).toBeUndefined();
        expect(createPipelineSearchOptions('  ').filterOperator).toBeUndefined();
    });

    it('advances by the items actually loaded and stops at the total', () => {
        expect(getNextListPageOffset([
            { items: Array.from({ length: 6 }), totalItems: 14 },
            { items: Array.from({ length: 6 }), totalItems: 14 },
        ])).toBe(12);
        expect(getNextListPageOffset([
            { items: Array.from({ length: 6 }), totalItems: 8 },
            { items: Array.from({ length: 2 }), totalItems: 8 },
        ])).toBeUndefined();
    });

    it('stops after an empty page even when the reported total is stale', () => {
        expect(getNextListPageOffset([
            { items: Array.from({ length: 6 }), totalItems: 20 },
            { items: [], totalItems: 20 },
        ])).toBeUndefined();
    });
});
