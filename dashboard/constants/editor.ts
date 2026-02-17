import { PORTS, HTTP, BATCH, UI_TIMEOUTS, TIME_UNITS } from './defaults';

export const NODE_LAYOUT = {
    INITIAL_X: 120,
    INITIAL_Y: 120,
    SPACING_X: 280,
    SPACING_Y: 140,
} as const;

export const UI_DEFAULTS = {
    PAGE_SIZE: 100,
    LOG_EXPLORER_PAGE_SIZE: 50,
    PIPELINE_STATS_DISPLAY_COUNT: 6,
    EVENT_DISPLAY_LIMIT: 20,
    RECENT_LOGS_LIMIT: 50,
    RECENT_ACTIVITY_LIMIT: 10,
    EVENTS_LIMIT: 50,
    AUTO_REFRESH_INTERVAL_MS: 10_000,
    COPY_FEEDBACK_TIMEOUT_MS: UI_TIMEOUTS.COPY_FEEDBACK_MS,
    PREVIEW_ROWS: 10,
    IMPORT_PREVIEW_ROWS: 100,
    EXPORT_BATCH_SIZE: BATCH.EXPORT_BATCH_SIZE,
    IMPORT_BATCH_SIZE: BATCH.SIZE,
    DEFAULT_MAX_RETRIES: HTTP.MAX_RETRIES,
    DEFAULT_ERROR_THRESHOLD_PERCENT: 10,
    DEFAULT_SFTP_PORT: PORTS.SFTP,
    DEFAULT_CACHE_TTL_SECONDS: 3600,
    WEBHOOK_PATH_PREFIX: '/webhooks/data-hub/',
    CRON_PLACEHOLDER: '0 0 * * *',
} as const;

export const PIPELINE_RETRY_DEFAULTS = {
    DELAY_MS: TIME_UNITS.SECOND,
    MAX_DELAY_MS: HTTP.RETRY_MAX_DELAY_MS,
    MIN_DELAY_MS: TIME_UNITS.SECOND,
} as const;

export const PIPELINE_CHECKPOINT_DEFAULTS = {
    INTERVAL_RECORDS: 1000,
    INTERVAL_MS: TIME_UNITS.MINUTE,
    MIN_INTERVAL_MS: TIME_UNITS.SECOND,
} as const;

export const STEP_CONFIG_DEFAULTS = {
    THROUGHPUT_BATCH_SIZE: 50,
    THROUGHPUT_CONCURRENCY: 10,
    RETRY_MAX_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
    GATE_TIMEOUT_SECONDS: 300,
    GATE_MIN_APPROVERS: 5,
    GATE_THRESHOLD_PERCENT: 10,
    GATE_PREVIEW_COUNT: 10,
} as const;

export const RETENTION_DEFAULTS = {
    RUNS_DAYS: 7,
    ERROR_DAYS: 30,
} as const;

/** Default edge style for ReactFlow pipeline connections */
export const EDGE_STYLE = {
    STROKE_WIDTH: 2,
} as const;

/** Canvas CSS class for the ReactFlow editor background */
export const CANVAS_BG_CLASS = 'bg-gray-50' as const;

/** Run mode options for pipeline execution */
export const RUN_MODES = [
    { value: 'SYNC', label: 'Sync (blocking)' },
    { value: 'ASYNC', label: 'Async (background)' },
    { value: 'BATCH', label: 'Batch (grouped)' },
    { value: 'STREAM', label: 'Stream (real-time)' },
] as const;

/** Default run mode */
export const DEFAULT_RUN_MODE = 'BATCH' as const;

/** Parallel execution error policy options */
export const ERROR_POLICIES = [
    { value: 'FAIL_FAST', label: 'Fail Fast (stop on error)' },
    { value: 'CONTINUE', label: 'Continue (finish others)' },
    { value: 'BEST_EFFORT', label: 'Best Effort (ignore errors)' },
] as const;

/** Default error policy */
export const DEFAULT_ERROR_POLICY = 'FAIL_FAST' as const;

