/**
 * Webhook configuration and retry defaults
 */

/**
 * Webhook configuration defaults
 */
export const WEBHOOK = {
    /** Request timeout in milliseconds */
    TIMEOUT_MS: 30_000,
    /** Interval for retrying failed webhooks */
    RETRY_CHECK_INTERVAL_MS: 30_000,
    /** Maximum delay between retries */
    MAX_DELAY_MS: 3_600_000, // 1 hour
    /** Maximum delay for hook webhooks */
    HOOK_MAX_DELAY_MS: 300_000, // 5 minutes
    /** Backoff multiplier for retries */
    BACKOFF_MULTIPLIER: 2,
    /** Initial delay for retries */
    INITIAL_DELAY_MS: 1_000,
    /** Maximum retry attempts */
    MAX_ATTEMPTS: 5,
    /** Default signature header name */
    SIGNATURE_HEADER: 'X-DataHub-Signature',
} as const;
