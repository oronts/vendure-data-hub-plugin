/**
 * Shared Pagination Utilities
 *
 * Common pagination state management for API extractors.
 * Used by HTTP API and GraphQL extractors.
 *
 * @module extractors/shared
 */

/**
 * Base pagination state interface
 * Represents the common state needed for all pagination types.
 */
export interface BasePaginationState {
    /** Current cursor for cursor-based pagination */
    cursor?: string;
    /** Current offset for offset-based pagination */
    offset: number;
    /** Current page number */
    page: number;
    /** Number of records in the current page */
    recordCount: number;
}

/**
 * Extended pagination state with tracking fields
 * Used by extractors that need additional tracking.
 */
export interface ExtendedPaginationState extends BasePaginationState {
    /** Total records fetched so far */
    totalFetched: number;
}

/**
 * Result of pagination state update
 */
export interface PaginationUpdateResult<T extends BasePaginationState> {
    /** Whether there are more pages to fetch */
    hasMore: boolean;
    /** Updated pagination state */
    state: T;
}

/**
 * Initialize base pagination state with default values.
 * Common initialization for all pagination-enabled extractors.
 *
 * @returns Initial pagination state
 */
export function initBasePaginationState(): BasePaginationState {
    return {
        cursor: undefined,
        offset: 0,
        page: 1,
        recordCount: 0,
    };
}

/**
 * Initialize extended pagination state with tracking fields.
 * Used by extractors that need to track total fetched records.
 *
 * @returns Initial extended pagination state
 */
export function initExtendedPaginationState(): ExtendedPaginationState {
    return {
        cursor: undefined,
        offset: 0,
        page: 0,
        recordCount: 0,
        totalFetched: 0,
    };
}

/**
 * Check if we've reached the maximum pages limit.
 *
 * @param currentPage - Current page number
 * @param maxPages - Maximum pages allowed (undefined means no limit)
 * @returns True if max pages reached
 */
export function hasReachedMaxPages(
    currentPage: number,
    maxPages: number | undefined,
): boolean {
    if (maxPages === undefined) return false;
    return currentPage >= maxPages;
}

/**
 * Calculate new offset after fetching a page.
 *
 * @param currentOffset - Current offset
 * @param recordCount - Number of records in current page
 * @returns New offset
 */
export function calculateNextOffset(
    currentOffset: number,
    recordCount: number,
): number {
    return currentOffset + recordCount;
}

/**
 * Determine if there are more pages based on record count.
 * Common heuristic: if we got a full page, there might be more.
 *
 * @param recordCount - Number of records in current page
 * @param pageSize - Expected page size
 * @returns True if likely more pages
 */
export function hasMoreByRecordCount(
    recordCount: number,
    pageSize: number,
): boolean {
    return recordCount >= pageSize;
}
