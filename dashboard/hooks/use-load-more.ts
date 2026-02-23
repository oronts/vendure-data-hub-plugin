import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface UseLoadMoreOptions {
    pageSize?: number;
}

export function useLoadMore<T>(items: T[], options?: UseLoadMoreOptions) {
    const pageSize = options?.pageSize ?? 10;
    const [displayCount, setDisplayCount] = useState(pageSize);
    const prevLengthRef = useRef(items.length);

    // Reset displayCount when items array changes length (new data loaded)
    useEffect(() => {
        if (items.length !== prevLengthRef.current) {
            prevLengthRef.current = items.length;
            setDisplayCount(pageSize);
        }
    }, [items.length, pageSize]);

    const displayed = useMemo(() => items.slice(0, displayCount), [items, displayCount]);
    const hasMore = displayCount < items.length;
    const remaining = items.length - displayCount;

    const loadMore = useCallback(() => {
        setDisplayCount(c => c + pageSize);
    }, [pageSize]);

    return { displayed, hasMore, remaining, loadMore };
}
