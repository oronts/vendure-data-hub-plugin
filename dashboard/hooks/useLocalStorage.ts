/**
 * useLocalStorage Hook
 * Persists state in localStorage with automatic serialization
 */

import * as React from 'react';

export function useLocalStorage<T>(
    key: string,
    initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
    // Get initial value from localStorage or use provided initial value
    const [storedValue, setStoredValue] = React.useState<T>(() => {
        if (typeof window === 'undefined') {
            return initialValue;
        }
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch {
            // localStorage access failed - return initial value (SSR, private browsing, storage full)
            return initialValue;
        }
    });

    // Update localStorage when value changes
    const setValue: React.Dispatch<React.SetStateAction<T>> = React.useCallback(
        (value) => {
            try {
                const valueToStore = value instanceof Function ? value(storedValue) : value;
                setStoredValue(valueToStore);
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(key, JSON.stringify(valueToStore));
                }
            } catch {
                // localStorage write failed - value stored in state but not persisted
            }
        },
        [key, storedValue]
    );

    return [storedValue, setValue];
}

export default useLocalStorage;
