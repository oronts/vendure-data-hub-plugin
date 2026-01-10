/**
 * Editor Constants
 * Pipeline editor defaults and UI configuration values
 */

// Pipeline editor layout defaults
export const EDITOR_DEFAULTS = {
    GRID_SIZE: 20,
    NODE_WIDTH: 280,
    NODE_HEIGHT: 80,
    INITIAL_X: 100,
    INITIAL_Y: 100,
    NODE_SPACING_X: 350,
    NODE_SPACING_Y: 150,
} as const;

// UI defaults and limits
export const UI_DEFAULTS = {
    // Query limits
    QUERY_ALL_LIMIT: 999,
    PAGE_SIZE: 100,
    RECENT_LOGS_LIMIT: 50,
    RECENT_ACTIVITY_LIMIT: 10,
    EVENTS_LIMIT: 50,

    // Refresh intervals (milliseconds)
    AUTO_REFRESH_INTERVAL_MS: 10_000,
    COPY_FEEDBACK_TIMEOUT_MS: 2_000,

    // Preview limits
    PREVIEW_ROWS: 10,
    MAX_PREVIEW_ROWS: 50,

    // Batch sizes
    EXPORT_BATCH_SIZE: 1000,
    EXPORT_QUERY_LIMIT: 10000,
    DEFAULT_MAX_RETRIES: 3,
} as const;
