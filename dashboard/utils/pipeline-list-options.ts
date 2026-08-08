import {
    LogicalOperator,
    SortOrder,
    type DataHubPipelineListOptions,
} from '../types';

export const PIPELINE_SELECTOR_PAGE_SIZE = 25;

export function createPipelineSearchOptions(
    searchTerm: string,
): DataHubPipelineListOptions {
    const normalizedSearch = searchTerm.trim();
    return {
        take: PIPELINE_SELECTOR_PAGE_SIZE,
        skip: 0,
        sort: { name: SortOrder.ASC },
        filter: normalizedSearch
            ? {
                name: { contains: normalizedSearch },
                code: { contains: normalizedSearch },
            }
            : undefined,
        filterOperator: normalizedSearch ? LogicalOperator.OR : undefined,
    };
}
