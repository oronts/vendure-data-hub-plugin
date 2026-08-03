/**
 * File storage and output format defaults
 */

import * as path from 'path';
import { TIME_UNITS } from '../../../shared/constants';
import { IS_BROWSER } from '../../utils/environment';

const getExportRoot = (): string => {
    if (IS_BROWSER) {
        return '/exports';
    }
    const configuredRoot = process.env.DATA_HUB_EXPORT_ROOT?.trim();
    return path.resolve(configuredRoot || path.join(process.cwd(), 'exports'));
};

const EXPORT_ROOT = getExportRoot();
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * File storage defaults
 */
export const FILE_STORAGE = {
    /** Maximum file size in bytes */
    MAX_FILE_SIZE_BYTES,
    /** Maximum JSON envelope size for a base64-encoded file upload */
    MAX_BASE64_JSON_BODY_SIZE_BYTES:
        4 * Math.ceil(MAX_FILE_SIZE_BYTES / 3) + 64 * 1024,
    /** Maximum number of files per upload request */
    FILE_MAX_FILES: 10,
    /** File expiry time in minutes */
    EXPIRY_MINUTES: 60 * 24, // 24 hours
    /** Maximum temporary file expiry time accepted by the upload API */
    MAX_EXPIRY_MINUTES: 60 * 24 * 10,
    /** Root for all server-local exports */
    EXPORT_ROOT,
    /** Maximum number of entries in the in-memory file index before LRU eviction */
    MAX_FILE_INDEX_SIZE: 10_000,
    /** Percentage of entries to evict when file index reaches max size (0.0-1.0) */
    FILE_INDEX_EVICTION_RATIO: 0.1,
} as const;

/**
 * S3 storage defaults
 */
export const S3_STORAGE = {
    /** Default AWS region */
    DEFAULT_REGION: 'us-east-1',
    /** Minimum signed URL expiry in seconds */
    MIN_SIGNED_URL_EXPIRY_SEC: 1,
    /** Default signed URL expiry in seconds (1 hour) */
    SIGNED_URL_EXPIRY_SEC: 3600,
    /** Maximum SigV4 signed URL expiry in seconds (7 days) */
    MAX_SIGNED_URL_EXPIRY_SEC: 7 * TIME_UNITS.DAY / TIME_UNITS.SECOND,
} as const;

/**
 * File watch trigger defaults
 */
export const FILE_WATCH = {
    /** Minimum allowed polling interval in milliseconds (30 seconds) */
    MIN_POLL_INTERVAL_MS: 30_000,
    /** Default polling interval in milliseconds (5 minutes) */
    DEFAULT_POLL_INTERVAL_MS: 5 * 60 * 1000,
    /** Maximum polling interval (24 hours) */
    MAX_POLL_INTERVAL_MS: TIME_UNITS.DAY,
    /** Default minimum file age in seconds */
    DEFAULT_MIN_FILE_AGE_SEC: 30,
    /** Minimum accepted file age in seconds */
    MIN_FILE_AGE_SEC: 0,
    /** Maximum accepted file age in seconds (7 days) */
    MAX_FILE_AGE_SEC: 7 * TIME_UNITS.DAY / TIME_UNITS.SECOND,
    /** Maximum number of active file watchers */
    MAX_WATCHERS: 500,
    /** Maximum directory depth traversed by recursive FTP/SFTP discovery */
    MAX_REMOTE_DIRECTORY_DEPTH: 20,
    /** Maximum number of remote entries examined during one discovery poll */
    MAX_REMOTE_ENTRIES_PER_POLL: 10_000,
    /** Maximum number of paginated remote listing requests during one poll */
    MAX_REMOTE_PAGES_PER_POLL: 1_000,
    /** Poll interval while a triggered pipeline run is active */
    RUN_STATUS_POLL_INTERVAL_MS: 5_000,
    /** Crash-recovery idempotency window for a file-triggered run */
    RUN_IDEMPOTENCY_TTL_SEC: 7 * 24 * 60 * 60,
} as const;

/**
 * Generate output file path based on pipeline config
 */
export function getOutputPath(pipelineCode: string, format: string, extension?: string): string {
    const ext = extension || format;
    return `${pipelineCode}-${Date.now()}.${ext}`;
}
