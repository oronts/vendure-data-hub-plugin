/**
 * UI, display, and pagination defaults
 */

/**
 * Pagination parameter names for HTTP API extractors
 */
export const PAGINATION_PARAMS = {
    /** Default offset parameter name */
    OFFSET: 'offset',
    /** Default limit parameter name */
    LIMIT: 'limit',
    /** Default cursor parameter name */
    CURSOR: 'cursor',
    /** Default page parameter name */
    PAGE: 'page',
    /** Default page size parameter name */
    PAGE_SIZE: 'pageSize',
    /** Alternative page size parameter name (common in APIs) */
    PER_PAGE: 'per_page',
} as const;

/**
 * Pagination and limits defaults
 */
export const PAGINATION = {
    /** Maximum limit for resolver query results (security cap) */
    MAX_QUERY_LIMIT: 500,
    /** Maximum log entries to return for a single pipeline run */
    MAX_RUN_LOG_ENTRIES: 10000,
    /** Maximum pages to fetch from paginated APIs */
    MAX_PAGES: 100,
    /** Maximum pages for GraphQL queries */
    MAX_GRAPHQL_PAGES: 100,
    /** Default page size for data extraction */
    PAGE_SIZE: 100,
    /** Default page size for database queries (larger for SQL) */
    DATABASE_PAGE_SIZE: 1000,
    /** Maximum page size for database queries (safety limit) */
    DATABASE_MAX_PAGE_SIZE: 100000,
    /** Default page size for admin list views */
    LIST_PAGE_SIZE: 20,
    /** Limit for recent logs queries */
    RECENT_LOGS_LIMIT: 100,
    /** Limit for events display */
    EVENTS_LIMIT: 50,
    /** Limit for feed preview records */
    FEED_PREVIEW_LIMIT: 10,
    /** Limit for file preview rows */
    FILE_PREVIEW_ROWS: 10,
    /** Limit for top errors display */
    TOP_ERRORS_LIMIT: 10,
    /** Limit for recent activity display */
    RECENT_ACTIVITY_LIMIT: 10,
    /** Limit for search results */
    SEARCH_RESULTS_LIMIT: 100,
    /** Limit for querying all records (safety) */
    QUERY_ALL_LIMIT: 999,
} as const;

/**
 * Truncation limits for display/storage
 */
export const TRUNCATION = {
    /** Maximum length for error messages and field values */
    ERROR_MESSAGE_MAX_LENGTH: 200,
    /** Maximum length for field values in logging */
    MAX_FIELD_VALUE_LENGTH: 200,
    /** Maximum length for response body logging */
    RESPONSE_BODY_MAX_LENGTH: 1000,
    /** Length of webhook ID hash */
    WEBHOOK_ID_HASH_LENGTH: 16,
    /** Length for value preview */
    VALUE_PREVIEW_LENGTH: 50,
    /** Maximum description length for feeds */
    FEED_DESCRIPTION_MAX_LENGTH: 5000,
    /** Maximum characters for content preview */
    CONTENT_PREVIEW_LENGTH: 1000,
    /** Maximum unique values to track for statistics */
    MAX_UNIQUE_VALUES: 1000,
    /** Maximum custom aliases allowed */
    MAX_CUSTOM_ALIASES: 1000,
    /** Maximum sample values to store per field for preview */
    SAMPLE_VALUES_LIMIT: 5,
} as const;
