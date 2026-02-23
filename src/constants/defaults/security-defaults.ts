/**
 * Security and code execution defaults
 */

/**
 * Code security limits
 */
export const CODE_SECURITY = {
    /** Maximum length for user-provided code expressions */
    MAX_CODE_LENGTH: 10_000,
    /** Maximum length for condition expressions */
    MAX_CONDITION_LENGTH: 1_000,
    /** Maximum expression complexity (nesting depth, operations) */
    MAX_EXPRESSION_COMPLEXITY: 50,
    /** Maximum property access depth (a.b.c.d...) */
    MAX_PROPERTY_ACCESS_DEPTH: 10,
} as const;

/**
 * Safe evaluator defaults
 */
export const SAFE_EVALUATOR = {
    /** Maximum number of cached compiled functions */
    MAX_CACHE_SIZE: 1000,
    /** Default timeout in milliseconds */
    DEFAULT_TIMEOUT_MS: 5000,
    /** Cache eviction percentage (10% of cache evicted when full) */
    CACHE_EVICTION_PERCENT: 0.1,
} as const;
