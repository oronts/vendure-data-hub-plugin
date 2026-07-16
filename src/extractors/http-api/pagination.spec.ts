import { describe, expect, it } from 'vitest';
import { PaginationType } from '../../constants/enums';
import { updatePaginationState } from './pagination';
import type { HttpResponse } from './types';

describe('HTTP pagination contract', () => {
    it('stores the next link for the following request', () => {
        const response: HttpResponse = {
            status: 200,
            statusText: 'OK',
            headers: {
                link: '<https://example.test/products?page=2>; rel="next"',
            },
            data: { items: [] },
        };

        expect(updatePaginationState(
            PaginationType.LINK_HEADER,
            response,
            { pagination: { type: 'LINK_HEADER' } },
            { offset: 0, page: 1, recordCount: 10 },
        )).toMatchObject({
            hasMore: true,
            nextUrl: 'https://example.test/products?page=2',
        });
    });

    it('uses the canonical limit for page completion', () => {
        expect(updatePaginationState(
            PaginationType.PAGE,
            {
                status: 200,
                statusText: 'OK',
                headers: {},
                data: [],
            },
            { pagination: { type: 'PAGE', limit: 25 } },
            { offset: 0, page: 1, recordCount: 24 },
        ).hasMore).toBe(false);
    });
});
