/**
 * Core shared defaults and common configurations
 */

/**
 * Shared constants - imported from shared folder
 */
import { PORTS, RETENTION, DEFAULT_HOSTS } from '../../../shared/constants';
export { PORTS, RETENTION, DEFAULT_HOSTS };

/**
 * Numeric calculation defaults
 */
export const NUMERIC = {
    /** Default decimal places for formatting */
    DEFAULT_DECIMALS: 2,
} as const;

/**
 * Transform limits
 */
export const TRANSFORM_LIMITS = {
    /** Maximum length for generated slugs */
    SLUG_MAX_LENGTH: 200,
    /** Currency minor units multiplier (e.g., cents = dollars * 100) */
    CURRENCY_MINOR_UNITS_MULTIPLIER: 100,
    /** Default decimal precision for currency formatting */
    CURRENCY_DECIMAL_PLACES: 2,
    /** Default description truncation for feeds */
    DESCRIPTION_TRUNCATE_LENGTH: 500,
} as const;

/**
 * Internal timing constants
 */
export const INTERNAL_TIMINGS = {
    /** Cleanup interval for cache/rate-limit stores (ms) */
    CLEANUP_INTERVAL_MS: 60_000,
    /** Short wait delay for connection pooling (ms) */
    CONNECTION_WAIT_MS: 100,
    /** Default rate limit window (ms) */
    DEFAULT_RATE_LIMIT_WINDOW_MS: 60_000,
    /** Default maximum requests per rate limit window */
    DEFAULT_RATE_LIMIT_MAX_REQUESTS: 60,
    /** Default webhook rate limit requests per minute */
    DEFAULT_WEBHOOK_RATE_LIMIT: 100,
    /** Maximum idle time for pooled connections before cleanup (ms) */
    CONNECTION_MAX_IDLE_MS: 5 * 60 * 1000, // 5 minutes
    /** Maximum retries when waiting for a connection (prevents infinite recursion) */
    CONNECTION_RETRY_MAX: 10,
    /** Cleanup interval for pending messages map (ms) */
    PENDING_MESSAGES_CLEANUP_INTERVAL_MS: 60_000,
    /** Maximum age for pending messages before cleanup (ms) */
    PENDING_MESSAGES_MAX_AGE_MS: 10 * 60 * 1000, // 10 minutes
    /** Maximum number of pending (unacknowledged) messages before rejecting new ones */
    MAX_PENDING_MESSAGES: 10_000,
} as const;
