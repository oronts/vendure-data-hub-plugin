export interface BasePaginationState {
    cursor?: string;
    offset: number;
    page: number;
    recordCount: number;
}

export interface ExtendedPaginationState extends BasePaginationState {
    totalFetched: number;
}

export interface PaginationUpdateResult<T extends BasePaginationState> {
    hasMore: boolean;
    state: T;
}

export function initBasePaginationState(): BasePaginationState {
    return {
        cursor: undefined,
        offset: 0,
        page: 1,
        recordCount: 0,
    };
}

export function initExtendedPaginationState(): ExtendedPaginationState {
    return {
        cursor: undefined,
        offset: 0,
        page: 0,
        recordCount: 0,
        totalFetched: 0,
    };
}

export function hasReachedMaxPages(
    currentPage: number,
    maxPages: number | undefined,
): boolean {
    if (maxPages === undefined) return false;
    return currentPage >= maxPages;
}

export function calculateNextOffset(
    currentOffset: number,
    recordCount: number,
): number {
    return currentOffset + recordCount;
}

/** Full page = likely more pages to fetch */
export function hasMoreByRecordCount(
    recordCount: number,
    pageSize: number,
): boolean {
    return recordCount >= pageSize;
}
