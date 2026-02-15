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

type SentinelValue = typeof SENTINEL_VALUES[keyof typeof SENTINEL_VALUES];
