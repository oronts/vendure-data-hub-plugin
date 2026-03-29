/**
 * File storage and output format defaults
 */

import * as os from 'os';
import * as path from 'path';
import { IS_BROWSER } from '../../utils/environment';

const getTempBase = (): string => {
    if (IS_BROWSER) {
        return '/tmp';
    }
    return process.env.DATA_HUB_TEMP_DIR || os.tmpdir();
};

const TEMP_BASE = getTempBase();

/**
 * File storage defaults
 */
export const FILE_STORAGE = {
    /** Maximum file size in bytes */
    MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100MB
    /** Maximum number of files per upload request */
    FILE_MAX_FILES: 10,
    /** File expiry time in minutes */
    EXPIRY_MINUTES: 60 * 24, // 24 hours
    /** Temp directory for exports (configurable via DATA_HUB_TEMP_DIR env var) */
    TEMP_DIR: TEMP_BASE,
    /** Maximum number of entries in the in-memory file index before LRU eviction */
    MAX_FILE_INDEX_SIZE: 10_000,
    /** Percentage of entries to evict when file index reaches max size (0.0-1.0) */
    FILE_INDEX_EVICTION_RATIO: 0.1,
} as const;

/**
 * S3 storage defaults
 */
export const S3_STORAGE = {
    /** Default signed URL expiry in seconds (1 hour) */
    SIGNED_URL_EXPIRY_SEC: 3600,
} as const;

/**
 * File watch trigger defaults
 */
export const FILE_WATCH = {
    /** Minimum allowed polling interval in milliseconds (30 seconds) */
    MIN_POLL_INTERVAL_MS: 30_000,
    /** Default polling interval in milliseconds (5 minutes) */
    DEFAULT_POLL_INTERVAL_MS: 5 * 60 * 1000,
    /** Default minimum file age in milliseconds (30 seconds) */
    DEFAULT_MIN_FILE_AGE_MS: 30_000,
    /** Maximum number of active file watchers */
    MAX_WATCHERS: 500,
} as const;

/**
 * Generate output file path based on pipeline config
 */
export function getOutputPath(pipelineCode: string, format: string, extension?: string): string {
    const ext = extension || format;
    const timestamp = Date.now();
    if (IS_BROWSER) {
        return `${TEMP_BASE}/${pipelineCode}-${timestamp}.${ext}`;
    }
    return path.join(TEMP_BASE, `${pipelineCode}-${timestamp}.${ext}`);
}
