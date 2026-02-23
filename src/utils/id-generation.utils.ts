/**
 * ID Generation Utilities
 *
 * Backend-only helpers for generating unique identifiers.
 * Uses Node.js crypto for randomness.
 */

import * as crypto from 'crypto';

/** Max effective length: 32 (UUID hex chars without dashes). Values above 32 are clamped. */
const MAX_HEX_LENGTH = 32;

/**
 * Generate a short random hex string from a UUID.
 *
 * @param length  Number of hex characters (default: 8, max: 32)
 */
export function randomHexSlice(length = 8): string {
    const safeLength = Math.min(length, MAX_HEX_LENGTH);
    return crypto.randomUUID().replace(/-/g, '').substring(0, safeLength);
}

/**
 * Generate a unique timestamped ID with a prefix.
 *
 * Format: `${prefix}_${base36Timestamp}_${randomHex}`
 *
 * @param prefix  Short identifier prefix (e.g. 'span', 'batch', 'log')
 * @param length  Number of hex characters from the random UUID suffix (default: 7)
 */
export function generateTimestampedId(prefix: string, length = 7): string {
    return `${prefix}_${Date.now().toString(36)}_${randomHexSlice(length)}`;
}
