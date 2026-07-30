/**
 * Sink and queue defaults for destinations
 */

/**
 * Sink defaults for search engine and webhook integrations
 */
export const SINK = {
    /** Default index name for search engines */
    DEFAULT_INDEX_NAME: 'products',
    /** Default ID field for document identification */
    DEFAULT_ID_FIELD: 'id',
    /** Default batch size for queue operations */
    QUEUE_BATCH_SIZE: 100,
    /** Default batch size for webhook operations */
    WEBHOOK_BATCH_SIZE: 100,
    /** Base delay in ms for exponential backoff */
    BACKOFF_BASE_DELAY_MS: 100,
    /** Default Typesense port */
    TYPESENSE_DEFAULT_PORT: 8108,
} as const;

/**
 * Webhook queue defaults
 */
export const WEBHOOK_QUEUE = {
    /** Rows claimed and enqueued per dispatcher pass */
    DISPATCH_BATCH_SIZE: 100,
    /** Rows updated or deleted by one maintenance statement */
    MAINTENANCE_BATCH_SIZE: 100,
    /** Maximum rows deleted per status during one history cleanup */
    MAX_MAINTENANCE_ROWS_PER_PASS: 1_000,
    /** Interval between bounded webhook history cleanup passes */
    HISTORY_CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
    /** Lease held while a queued delivery waits for or runs in a worker */
    DISPATCH_LEASE_MS: 120_000,
    /** Delay before re-enqueueing after a queue publication failure */
    ENQUEUE_RETRY_DELAY_MS: 5_000,
    /** Vendure queue retries stay disabled because the database outbox owns retries */
    JOB_RETRIES: 0,
    /** Maximum operator-visible error length */
    LAST_ERROR_MAX_LENGTH: 1_000,
    /** Hard ceiling for configured delivery attempts */
    MAX_RETRY_ATTEMPTS: 20,
    /** Hard ceiling for configured retry delays (24 hours) */
    MAX_RETRY_DELAY_MS: 86_400_000,
    /** Hard ceiling for exponential backoff multipliers */
    MAX_BACKOFF_MULTIPLIER: 10,
    /** Retention time for delivered webhooks (1 minute) */
    DELIVERED_RETENTION_MS: 60_000,
    /** Retention time for dead letter webhooks (24 hours) */
    DEAD_LETTER_RETENTION_MS: 24 * 60 * 60 * 1000,
} as const;

/**
 * Throughput controller defaults
 */
export const THROUGHPUT = {
    /** Maximum size of drain queue */
    MAX_QUEUE_SIZE: 1000,
    /** Default deferred queue retry delay in seconds */
    DEFERRED_RETRY_DELAY_SEC: 5,
} as const;
