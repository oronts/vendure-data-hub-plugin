/**
 * Check if running in a browser environment
 */
export const IS_BROWSER = typeof globalThis !== 'undefined' &&
    typeof (globalThis as typeof globalThis & { window?: unknown }).window !== 'undefined';
