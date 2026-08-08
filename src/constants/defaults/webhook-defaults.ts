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
    /** Maximum API key header value length */
    MAX_API_KEY_LENGTH: 512,
    /** Maximum HMAC signature header value length */
    MAX_SIGNATURE_LENGTH: 256,
    /** Maximum authorization header value length */
    MAX_AUTH_HEADER_LENGTH: 16_384,
    /** Expected number of JWT parts (header.payload.signature) */
    JWT_PARTS_COUNT: 3,
    /** Required JWT signing algorithm */
    REQUIRED_JWT_ALGORITHM: 'HS256',
    /** Maximum configured JWT issuer or audience length */
    MAX_JWT_CLAIM_LENGTH: 512,
    /** Allowed HMAC signing algorithms */
    ALLOWED_HMAC_ALGORITHMS: ['sha256', 'sha512'] as readonly string[],
    /** Maximum outgoing idempotency key length */
    IDEMPOTENCY_KEY_MAX_LENGTH: 256,
    /** Default incoming idempotency request header */
    DEFAULT_IDEMPOTENCY_HEADER: 'x-idempotency-key',
    /** Default incoming idempotency retention (24 hours) */
    DEFAULT_IDEMPOTENCY_TTL_SEC: 86_400,
    /** Minimum incoming idempotency retention */
    MIN_IDEMPOTENCY_TTL_SEC: 60,
    /** Maximum incoming idempotency retention (7 days) */
    MAX_IDEMPOTENCY_TTL_SEC: 604_800,
    /** Per-process pre-authentication request ceiling per source IP */
    PRE_AUTH_RATE_LIMIT_REQUESTS: 120,
    /** Pre-authentication rate-limit window */
    PRE_AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
    /** Maximum configured authenticated requests per window */
    MAX_RATE_LIMIT_REQUESTS: 10_000,
    /** Minimum configured rate-limit window */
    MIN_RATE_LIMIT_WINDOW_SEC: 1,
    /** Maximum configured rate-limit window (24 hours) */
    MAX_RATE_LIMIT_WINDOW_SEC: 86_400,
    /** Maximum webhook payload size in bytes (10 MB) */
    MAX_PAYLOAD_SIZE: 10 * 1024 * 1024,
} as const;
