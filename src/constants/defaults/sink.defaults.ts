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
} as const;

/**
 * Webhook queue defaults
 */
export const WEBHOOK_QUEUE = {
    /** Maximum number of deliveries in queue */
    MAX_DELIVERY_QUEUE_SIZE: 10000,
    /** Maximum number of webhook configurations to cache */
    MAX_WEBHOOK_CONFIGS: 500,
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
