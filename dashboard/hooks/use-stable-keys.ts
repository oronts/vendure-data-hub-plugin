import { useMemo, useRef } from 'react';

let keyCounter = 0;
function generateStableKey(prefix: string): string {
    return `${prefix}-${++keyCounter}-${Date.now()}`;
}

/**
 * Generate stable React keys for items that may be reordered.
 * Uses object identity to track items across renders.
 */
export function useStableKeys<T extends object>(items: T[], prefix: string): string[] {
    const keysRef = useRef<Map<T, string>>(new Map());
    const prevItemsRef = useRef<T[]>([]);

    if (prevItemsRef.current !== items) {
        const newMap = new Map<T, string>();
        for (const item of items) {
            const existingKey = keysRef.current.get(item);
            newMap.set(item, existingKey ?? generateStableKey(prefix));
        }
        keysRef.current = newMap;
        prevItemsRef.current = items;
    }

    return items.map(item => keysRef.current.get(item) ?? generateStableKey(prefix));
}

/**
 * Generate stable IDs for list items that lack referential identity.
 * Uses index-based tracking: IDs persist at the same position across renders.
 * Items at existing indices keep their IDs; new indices get fresh IDs.
 *
 * Use this instead of useStableKeys when items are recreated each render
 * (e.g. from config objects, form state) and cannot be tracked by identity.
 */
export function useStableIndexIds(items: readonly unknown[], prefix: string): string[] {
    const idMapRef = useRef<Map<number, string>>(new Map());

    return useMemo(() => {
        const prevMap = idMapRef.current;
        const newMap = new Map<number, string>();

        const ids = items.map((_, index) => {
            const existing = prevMap.get(index);
            const id = existing ?? generateStableKey(prefix);
            newMap.set(index, id);
            return id;
        });

        idMapRef.current = newMap;
        return ids;
    }, [items, prefix]);
}
