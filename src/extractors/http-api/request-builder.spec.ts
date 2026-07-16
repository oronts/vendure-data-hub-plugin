import { describe, expect, it } from 'vitest';
import { PaginationType } from '../../constants/enums';
import { buildPaginatedRequest, prepareRequestBody } from './request-builder';
import type { HttpApiExtractorConfig } from './types';

function config(
    pagination: HttpApiExtractorConfig['pagination'],
): HttpApiExtractorConfig {
    return {
        adapterCode: 'httpApi',
        url: 'https://example.test/products',
        pagination,
    };
}

describe('HTTP request builder contract', () => {
    it('uses pagination.limit for page-based pagination', () => {
        const result = buildPaginatedRequest(
            config({
                type: 'PAGE',
                limit: 25,
                pageParam: 'currentPage',
                pageSizeParam: 'pageSize',
            }),
            PaginationType.PAGE,
            { offset: 0, page: 2, recordCount: 0 },
        );

        expect(result.url).toBe(
            'https://example.test/products?currentPage=2&pageSize=25',
        );
    });

    it('follows the resolved next URL for link-header pagination', () => {
        const result = buildPaginatedRequest(
            config({ type: 'LINK_HEADER' }),
            PaginationType.LINK_HEADER,
            {
                offset: 0,
                page: 1,
                recordCount: 10,
                nextUrl: 'https://example.test/products?page=2',
            },
        );

        expect(result.url).toBe('https://example.test/products?page=2');
    });

    it('serializes only the canonical HTTP body', () => {
        expect(prepareRequestBody({
            adapterCode: 'httpApi',
            url: 'https://example.test/products',
            body: { enabled: true },
        })).toBe('{"enabled":true}');
    });
});
