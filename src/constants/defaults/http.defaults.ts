/**
 * HTTP, network, and API request defaults
 */

/**
 * HTTP configuration defaults - imported from shared constants
 */
import { HTTP } from '../../../shared/constants';
export { HTTP };

/**
 * HTTP Status Codes
 */
export const HTTP_STATUS = {
    OK: 200,
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    REQUEST_TIMEOUT: 408,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
    /** Success range start (inclusive) */
    SUCCESS_MIN: 200,
    /** Success range end (exclusive) */
    SUCCESS_MAX: 300,
} as const;

/**
 * HTTP lookup operator defaults
 */
export const HTTP_LOOKUP = {
    /** Default cache TTL in seconds */
    DEFAULT_CACHE_TTL_SEC: 300,
    /** Default API key header name */
    DEFAULT_API_KEY_HEADER: 'X-API-Key',
    /** Default max retries for failed requests */
    DEFAULT_MAX_RETRIES: 2,
    /** Default batch size for bulk lookups */
    DEFAULT_BATCH_SIZE: 50,
} as const;

/**
 * Validation timeout limits (in milliseconds)
 */
export const VALIDATION_TIMEOUTS = {
    /** Minimum allowed timeout for HTTP requests */
    MIN_TIMEOUT_MS: 1_000,
    /** Maximum allowed timeout for HTTP requests */
    MAX_TIMEOUT_MS: 300_000,
} as const;
