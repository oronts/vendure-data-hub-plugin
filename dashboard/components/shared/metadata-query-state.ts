export interface MetadataQueryState {
    label: string;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
}

export type MetadataBoundaryStatus =
    | { state: 'ready' }
    | { state: 'loading' }
    | { state: 'error'; query: MetadataQueryState };

export function getMetadataBoundaryStatus(
    queries: readonly MetadataQueryState[],
): MetadataBoundaryStatus {
    const failed = queries.find(query => query.isError);
    if (failed) return { state: 'error', query: failed };
    return queries.some(query => query.isPending)
        ? { state: 'loading' }
        : { state: 'ready' };
}
