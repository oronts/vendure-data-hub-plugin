import { getErrorMessage } from '../../shared';

/**
 * Centralized toast message constants for the dashboard
 *
 * Follows naming convention:
 * - Success messages: TOAST_<CATEGORY>_<ACTION>_SUCCESS
 * - Error messages: TOAST_<CATEGORY>_<ACTION>_ERROR
 * - Warning messages: TOAST_<CATEGORY>_<ACTION>_WARNING
 */

/**
 * Pipeline-related toast messages
 */
export const TOAST_PIPELINE = {
    RUN_STARTED: 'Run started',
    RUN_START_ERROR: 'Failed to start run',
    RECORD_RETRY_QUEUED: 'Record retry queued',
    INVALID_JSON_PATCH: 'Invalid JSON patch',
    SAVE_SUCCESS: 'Successfully saved pipeline',
    SAVE_ERROR: 'Failed to save pipeline',
    SUBMITTED_FOR_REVIEW: 'Submitted for review',
    SUBMIT_ERROR: 'Submit failed',
    APPROVED: 'Approved',
    APPROVE_ERROR: 'Approve failed',
    REJECTED: 'Rejected',
    REJECT_ERROR: 'Reject failed',
    PUBLISHED: 'Published',
    PUBLISH_ERROR: 'Publish failed',
    VALIDATION_FIX_REQUIRED: 'Fix validation issues before publishing',
    ARCHIVED: 'Pipeline archived',
    ARCHIVE_ERROR: 'Failed to archive pipeline',
    RESTORED: 'Pipeline restored',
    DELETED: 'Pipeline deleted',
    DUPLICATED: 'Pipeline duplicated',
    DRY_RUN_FAILED: 'Dry run failed',
    HISTORY_LOAD_ERROR: 'Failed to load version history',
    GATE_APPROVED: 'Gate approved, resuming pipeline',
    GATE_APPROVE_ERROR: 'Failed to approve gate',
    GATE_REJECTED: 'Gate rejected, pipeline cancelled',
    GATE_REJECT_ERROR: 'Failed to reject gate',
} as const;

/**
 * Connection-related toast messages
 */
export const TOAST_CONNECTION = {
    SECRETS_LOAD_ERROR: 'Failed to load available secrets. Some features may be limited.',
    TEST_SUCCESS: 'Connection successful',
    TEST_FAILED: 'Connection failed',
    SAVE_SUCCESS: 'Connection saved successfully',
    SAVE_ERROR: 'Failed to save connection',
    DELETE_SUCCESS: 'Connection deleted successfully',
    DELETE_ERROR: 'Failed to delete connection',
} as const;

/**
 * Adapter-related toast messages
 */
export const TOAST_ADAPTER = {
    CONFIG_COPIED: 'Config copied to clipboard',
    COPY_ERROR: 'Failed to copy',
} as const;

/**
 * Hook-related toast messages
 */
export const TOAST_HOOK = {
    SELECT_PIPELINE_FIRST: 'Please select a pipeline first',
    TEST_SUCCESS: 'Hook test executed successfully',
} as const;

/**
 * Log-related toast messages
 */
export const TOAST_LOG = {
    EXPORT_SUCCESS: 'Logs exported successfully',
    EXPORT_ERROR: 'Failed to export logs',
} as const;

/**
 * File-related toast messages
 */
export const TOAST_FILE = {
    UNSUPPORTED_TYPE: 'Unsupported file type',
    EXCEL_REQUIRES_XLSX: 'Excel parsing requires xlsx library. Please use CSV or JSON.',
    NO_DATA_FOUND: 'No data found in file',
    PARSE_ERROR: 'Failed to parse file',
    PARSE_SUCCESS: 'Parsed {count} records',
    PARSED_ROWS_COLUMNS: 'Parsed {rows} rows with {columns} columns',
    MISSING_REQUIRED: 'Missing required fields: {fields}',
} as const;

/**
 * Wizard-related toast messages
 */
export const TOAST_WIZARD = {
    NAME_REQUIRED: 'Please provide a name for the configuration',
    IMPORT_NAME_REQUIRED: 'Please provide a name for the import configuration',
    EXPORT_NAME_REQUIRED: 'Please provide a name for the export configuration',
    URL_REQUIRED: 'Please enter a URL first',
    TEMPLATE_SELECTED: 'Template applied',
    IMPORT_CREATED: 'Import pipeline created',
    EXPORT_CREATED: 'Export pipeline created',
    CREATE_FAILED: 'Failed to create pipeline',
} as const;

/**
 * Secret-related toast messages
 */
export const TOAST_SECRET = {
    SAVE_SUCCESS: 'Secret saved successfully',
    SAVE_ERROR: 'Failed to save secret',
    DELETE_SUCCESS: 'Secret deleted successfully',
    DELETE_ERROR: 'Failed to delete secret',
} as const;

/**
 * Template-related toast messages
 */
export const TOAST_TEMPLATE = {
    SAMPLE_COPIED: 'Sample data copied to clipboard',
    SAMPLE_DOWNLOADED: 'Sample file downloaded',
} as const;

/**
 * Settings-related toast messages
 */
export const TOAST_SETTINGS = {
    VALIDATION_ERRORS: 'Please fix validation errors before saving',
    SAVE_SUCCESS: 'Settings saved successfully',
    SAVE_ERROR: 'Failed to save settings',
} as const;

/**
 * Helper to format parsed records toast
 */
export const formatParsedRecords = (count: number): string => {
    return TOAST_FILE.PARSE_SUCCESS.replace('{count}', String(count));
};

/**
 * Helper to format error messages with details
 */
export const formatParseError = (error: unknown): string => {
    const message = getErrorMessage(error);
    return `${TOAST_FILE.PARSE_ERROR}: ${message}`;
};

