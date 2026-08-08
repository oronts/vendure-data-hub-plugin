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
    /** Default number of cached compiled expressions */
    DEFAULT_CACHE_SIZE: 1_000,
    /** Smallest accepted compiled-expression cache */
    MIN_CACHE_SIZE: 1,
    /** Hard cap for compiled expressions retained by one evaluator */
    MAX_CACHE_SIZE: 10_000,
    /** Default timeout in milliseconds */
    DEFAULT_TIMEOUT_MS: 5_000,
    /** Smallest accepted execution timeout */
    MIN_TIMEOUT_MS: 1,
    /** Hard cap for evaluator and script execution */
    MAX_TIMEOUT_MS: 300_000,
    /** Cache eviction percentage (10% of cache evicted when full) */
    CACHE_EVICTION_PERCENT: 0.1,
} as const;

export const SECRET_SECURITY = {
    MASTER_KEY_ENV: 'DATAHUB_MASTER_KEY',
    NODE_ENV: 'NODE_ENV',
    PRODUCTION_ENV: 'production',
    MIN_MASTER_KEY_LENGTH: 32,
} as const;

export const SECRET_REFERENCE_PAGING = {
    DEFAULT_TAKE: 25,
    MAX_TAKE: 100,
    MAX_SEARCH_LENGTH: 200,
} as const;
