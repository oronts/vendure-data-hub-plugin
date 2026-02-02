/**
 * HTTP API Pagination
 *
 * Handles various pagination strategies for API responses.
 */

import { PaginationConfig, JsonObject } from '../../types/index';
import { HttpResponse, UpdatedPaginationState, PaginationState, HTTP_DEFAULTS } from './types';
import { PaginationType } from '../../constants/index';
import { getValueByPath } from './response-parser';

/**
 * Update pagination state based on response
 */
export function updatePaginationState(
    paginationType: PaginationType,
    response: HttpResponse,
    config: { pagination?: PaginationConfig },
    currentState: PaginationState,
): UpdatedPaginationState {
    const pagination = config.pagination;
    let hasMore = false;
    let cursor = currentState.cursor;
    let offset = currentState.offset;
    let page = currentState.page;

    switch (paginationType) {
        case PaginationType.OFFSET:
            offset += currentState.recordCount;
            hasMore = currentState.recordCount >= (pagination?.limit || HTTP_DEFAULTS.pageLimit);
            break;

        case PaginationType.CURSOR:
            cursor = extractCursor(response, pagination);
            hasMore = determineCursorHasMore(response, pagination, cursor, currentState.recordCount);
            break;

        case PaginationType.PAGE:
            page += 1;
            hasMore = currentState.recordCount >= (pagination?.pageSize || HTTP_DEFAULTS.pageLimit);
            break;

        case PaginationType.LINK_HEADER:
            hasMore = hasNextLink(response);
            break;

        case PaginationType.NONE:
            hasMore = false;
            break;
    }

    return { hasMore, cursor, offset, page };
}

/**
 * Extract cursor from response
 */
function extractCursor(
    response: HttpResponse,
    pagination?: PaginationConfig,
): string | undefined {
    if (!pagination?.cursorPath) return undefined;

    const cursor = getValueByPath(response.data as JsonObject, pagination.cursorPath);
    if (typeof cursor === 'string') return cursor;
    if (typeof cursor === 'number') return String(cursor);
    return undefined;
}

/**
 * Determine if there are more pages for cursor pagination
 */
function determineCursorHasMore(
    response: HttpResponse,
    pagination: PaginationConfig | undefined,
    cursor: string | undefined,
    recordCount: number,
): boolean {
    // Check explicit hasMore field
    if (pagination?.hasMorePath) {
        const hasMore = getValueByPath(response.data as JsonObject, pagination.hasMorePath);
        if (typeof hasMore === 'boolean') return hasMore;
    }

    // Fall back to checking if we got a cursor and full page
    return !!cursor && recordCount >= (pagination?.limit || HTTP_DEFAULTS.pageLimit);
}

/**
 * Check if response has next link in Link header
 */
function hasNextLink(response: HttpResponse): boolean {
    const linkHeader = response.headers['link'];
    if (!linkHeader) return false;

    return linkHeader.includes('rel="next"') || linkHeader.includes("rel='next'");
}

/**
 * Parse Link header and extract URLs
 */
export function parseLinkHeader(
    linkHeader: string,
): Record<string, string> {
    const links: Record<string, string> = {};

    const parts = linkHeader.split(',');
    for (const part of parts) {
        const match = part.match(/<([^>]+)>;\s*rel="?([^"]+)"?/);
        if (match) {
            links[match[2].trim()] = match[1].trim();
        }
    }

    return links;
}

/**
 * Get next page URL from Link header
 */
export function getNextPageUrl(response: HttpResponse): string | undefined {
    const linkHeader = response.headers['link'];
    if (!linkHeader) return undefined;

    const links = parseLinkHeader(linkHeader);
    return links['next'];
}

/**
 * Initialize pagination state
 */
export function initPaginationState(): PaginationState {
    return {
        cursor: undefined,
        offset: 0,
        page: 1,
        recordCount: 0,
    };
}

/**
 * Check if pagination is enabled
 */
export function isPaginationEnabled(config: { pagination?: PaginationConfig }): boolean {
    const type = config.pagination?.type;
    return type !== undefined && type !== PaginationType.NONE;
}

/**
 * Get pagination type from config
 */
export function getPaginationType(
    config: { pagination?: PaginationConfig },
): PaginationType {
    const type = config.pagination?.type;

    if (!type || type === PaginationType.NONE) return PaginationType.NONE;

    // The enum values match the string literal values exactly
    return type as PaginationType;
}

/**
 * Calculate estimated total pages
 */
export function estimateTotalPages(
    totalRecords: number | undefined,
    pageSize: number,
): number | undefined {
    if (totalRecords === undefined) return undefined;
    return Math.ceil(totalRecords / pageSize);
}

/**
 * Check if we've reached max pages limit
 */
export function hasReachedMaxPages(
    currentPage: number,
    maxPages: number | undefined,
): boolean {
    const limit = maxPages || HTTP_DEFAULTS.maxPages;
    return currentPage >= limit;
}
