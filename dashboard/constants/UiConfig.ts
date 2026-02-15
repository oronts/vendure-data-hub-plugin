import { LogPersistenceLevel } from '../gql/graphql';
import { type MatchConfidence } from './Defaults';

// Re-use from defaults to avoid duplication
export type { MatchConfidence };

/**
 * Polling intervals in milliseconds for real-time data updates.
 * These values balance responsiveness with server load.
 */
export const POLLING_INTERVALS = {
    /** Queue status polling: 5 seconds */
    QUEUES: 5000,
    /** Pipeline runs list polling: 5 seconds */
    PIPELINE_RUNS: 5000,
    /** Individual run details polling: 3 seconds (more frequent for active monitoring) */
    PIPELINE_RUN_DETAILS: 3000,
    /** Run errors list polling: 5 seconds */
    RUN_ERRORS: 5000,
    /** Analytics data polling: 10 seconds */
    ANALYTICS: 10000,
    /** Log entries polling: 30 seconds */
    LOGS: 30000,
    /** Live log streaming polling: 3 seconds */
    LIVE_LOGS: 3000,
    /** Error audit data polling: 10 seconds */
    ERROR_AUDITS: 10000,
    /** Default polling interval: 5 seconds */
    DEFAULT: 5000,
    /** Active run monitoring polling: 2 seconds (most frequent for real-time feedback) */
    ACTIVE_RUN: 2000,
    /** Events list polling: 5 seconds */
    EVENTS: 5000,
    /** Queue consumers polling: 5 seconds */
    CONSUMERS: 5000,
} as const;

export const UI_LIMITS = {
    MAX_PREVIEW_ROWS: 100,
    MAX_LOG_ENTRIES: 1000,
    TRUNCATE_LENGTH: 50,
    PREVIEW_ROW_LIMIT: 10,
    SAMPLE_VALUES_LIMIT: 3,
    CELL_TRUNCATE_LIMIT: 50,
    REALTIME_LOG_LIMIT: 50,
    TIMELINE_LIMIT: 20,
} as const;

export const BATCH_SIZES = {
    IMPORT_DEFAULT: 100,
    EXPORT_DEFAULT: 1000,
} as const;

export const QUERY_LIMITS = {
    /** Maximum items when fetching "all" records (safety limit to prevent memory issues) */
    ALL_ITEMS: 999,
    /** Maximum secrets to fetch in a single list query */
    SECRETS_LIST: 200,
    /** Default limit for export queries */
    EXPORT_DEFAULT: 10000,
    /** Default page size for paginated lists */
    PAGINATION_DEFAULT: 10,
} as const;

export const CACHE_TIMES = {
    /** Adapter catalog cache duration: 5 minutes */
    ADAPTER_CATALOG: 5 * 60 * 1000,
    /** Vendure schema cache duration: 10 minutes */
    VENDURE_SCHEMAS: 10 * 60 * 1000,
} as const;

export const EDITOR_HEIGHTS = {
    VISUAL: '600px',
    SIMPLE: '500px',
} as const;

export const PIPELINE_STATUS = {
    PUBLISHED: 'PUBLISHED',
    REVIEW: 'REVIEW',
    DRAFT: 'DRAFT',
    ARCHIVED: 'ARCHIVED',
} as const;

const PIPELINE_STATUS_VARIANTS = {
    PUBLISHED: 'default',
    REVIEW: 'outline',
    DRAFT: 'secondary',
    ARCHIVED: 'destructive',
} as const;

export type PipelineStatus = keyof typeof PIPELINE_STATUS_VARIANTS;
export type BadgeVariant = typeof PIPELINE_STATUS_VARIANTS[PipelineStatus];

export { scoreToConfidence } from './Defaults';

export function getStatusBadgeVariant(status: string): BadgeVariant {
    return PIPELINE_STATUS_VARIANTS[status as PipelineStatus] ?? 'secondary';
}

const OPERATOR_PLACEHOLDERS: Record<string, string> = {
    in: 'JSON array, e.g. ["A","B"]',
    regex: 'regex pattern',
    default: 'value',
} as const;

export function getOperatorPlaceholder(operator: string): string {
    return OPERATOR_PLACEHOLDERS[operator.toLowerCase()] ?? OPERATOR_PLACEHOLDERS.default;
}

export const LOG_PERSISTENCE_LEVELS: ReadonlyArray<{
    value: LogPersistenceLevel;
    label: string;
    description: string;
}> = [
    { value: LogPersistenceLevel.ERROR_ONLY, label: 'Errors Only', description: 'Only persist errors to database' },
    { value: LogPersistenceLevel.PIPELINE, label: 'Pipeline Events', description: 'Pipeline start/complete/fail + errors (default)' },
    { value: LogPersistenceLevel.STEP, label: 'Step Events', description: 'All pipeline events + step start/complete' },
    { value: LogPersistenceLevel.DEBUG, label: 'Debug', description: 'All events including debug information' },
];

export type { LogPersistenceLevel } from '../gql/graphql';

export const UI_STRINGS = {
    CRON_FORMAT_HINT: 'Format: minute hour day month weekday',
    PLACEHOLDER_OPTIONAL_DESCRIPTION: 'Optional description...',
    PLACEHOLDER_SELECT_FIELD: 'Select field',
    PLACEHOLDER_SELECT_SOURCE_FIELD: 'Select source field',
    PLACEHOLDER_SELECT_TARGET_FIELD: 'Select target field',
    PLACEHOLDER_SELECT_SECRET: 'Select secret...',
    PLACEHOLDER_SELECT_EVENT: 'Select event...',
    PLACEHOLDER_SELECT_CONNECTION: 'Select connection...',
    VALIDATION_ERRORS_TITLE: 'Please fix the following errors:',
    LABEL_LOADING: 'Loading...',
    LABEL_BACK: 'Back',
    LABEL_NEXT: 'Next',
    LABEL_CANCEL: 'Cancel',
    LABEL_NAME_REQUIRED: 'Name *',
    LABEL_DESCRIPTION: 'Description',
    GLOB_PATTERN_HINT: 'Glob patterns supported (e.g., *.csv, **/*.json)',
} as const;

/**
 * Filter dropdown sentinel values.
 * Used for filter select components where "All" represents no filter applied.
 * Note: For form field empty states, use SENTINEL_VALUES from sentinel-values.ts.
 */
export const FILTER_VALUES = {
    /** Represents "All" or no filter - maps to empty string when querying */
    ALL: '__all__',
} as const;

export const CONNECTION_DEFAULT_TYPE = 'HTTP';
