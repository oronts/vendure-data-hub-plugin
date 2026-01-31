/**
 * Sentinel values used for Select components that need to represent
 * empty/unselected states. HTML select elements require non-empty values,
 * so we use these sentinel strings to represent "no selection".
 */
export const SENTINEL_VALUES = {
    /** Represents an empty/unmapped field - use when a field should be cleared */
    EMPTY: '__empty__',
    /** Represents no selection - use for optional select dropdowns */
    NONE: '__none__',
} as const;

export type SentinelValue = typeof SENTINEL_VALUES[keyof typeof SENTINEL_VALUES];

/**
 * Helper to check if a value is a sentinel value
 */
export function isSentinelValue(value: string): value is SentinelValue {
    return value === SENTINEL_VALUES.EMPTY || value === SENTINEL_VALUES.NONE;
}

/**
 * Helper to convert a sentinel value to an actual value (empty string or undefined)
 */
export function fromSentinel(value: string): string {
    return isSentinelValue(value) ? '' : value;
}

/**
 * Helper to convert an empty/undefined value to a sentinel for Select components
 */
export function toSentinel(value: string | undefined | null, sentinel: SentinelValue = SENTINEL_VALUES.NONE): string {
    return value || sentinel;
}
