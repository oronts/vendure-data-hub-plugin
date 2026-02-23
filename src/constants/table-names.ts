export const TABLE_PREFIX = 'data_hub_';

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
