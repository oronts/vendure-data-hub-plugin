/**
 * DataHub Table Names
 *
 * Centralized table name constants to avoid hardcoded strings in entities.
 * All DataHub tables are prefixed with 'data_hub_' for namespace isolation.
 */

/** Prefix for all DataHub tables */
export const TABLE_PREFIX = 'data_hub_';

/**
 * Table names for all DataHub entities.
 * Using constants ensures consistency and makes refactoring easier.
 */
export const TABLE_NAMES = {
    // Config entities
    CONNECTION: `${TABLE_PREFIX}connection`,
    SECRET: `${TABLE_PREFIX}secret`,
    SETTINGS: `${TABLE_PREFIX}settings`,
    LOCK: `${TABLE_PREFIX}lock`,

    // Pipeline entities
    PIPELINE: `${TABLE_PREFIX}pipeline`,
    PIPELINE_RUN: `${TABLE_PREFIX}pipeline_run`,
    PIPELINE_LOG: `${TABLE_PREFIX}pipeline_log`,
    PIPELINE_REVISION: `${TABLE_PREFIX}pipeline_revision`,

    // Data entities
    CHECKPOINT: `${TABLE_PREFIX}checkpoint`,
    RECORD_ERROR: `${TABLE_PREFIX}record_error`,
    RECORD_RETRY_AUDIT: `${TABLE_PREFIX}record_retry_audit`,
} as const;

export type TableName = (typeof TABLE_NAMES)[keyof typeof TABLE_NAMES];
