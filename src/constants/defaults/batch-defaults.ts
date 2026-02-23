/**
 * Batch processing and streaming defaults
 */

/**
 * Batch processing defaults - imported from shared constants
 */
import { BATCH } from '../../../shared/constants';
export { BATCH };

/**
 * Batch rollback defaults
 */
export const BATCH_ROLLBACK = {
    /** Interval for cleaning up stale transactions (default: 5 minutes) */
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
    /** Maximum age for transactions before auto-cleanup (default: 1 hour) */
    MAX_TRANSACTION_AGE_MS: 60 * 60 * 1000,
} as const;

