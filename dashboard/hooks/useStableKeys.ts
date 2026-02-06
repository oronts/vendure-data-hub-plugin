import { useRef } from 'react';

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
