import { SortOrder } from '../types';

export const REFERENCE_SELECTOR_PAGE_SIZE = 25;

export interface CodeReferenceListOptions {
    take: number;
    skip: number;
    sort: { code: SortOrder };
    filter?: { code: { contains: string } };
}

export function createCodeReferenceListOptions(
    searchTerm: string,
): CodeReferenceListOptions {
    const normalizedSearch = searchTerm.trim();
    return {
        take: REFERENCE_SELECTOR_PAGE_SIZE,
        skip: 0,
        sort: { code: SortOrder.ASC },
        filter: normalizedSearch
            ? { code: { contains: normalizedSearch } }
            : undefined,
    };
}
