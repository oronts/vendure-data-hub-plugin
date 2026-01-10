/**
 * Formatters Utility
 * Common formatting functions for displaying data
 */

// =============================================================================
// VALUE FORMATTING
// =============================================================================

/**
 * Format a value for display in a table cell or preview
 */
export function formatValue(value: any, maxLength = 50): string {
    if (value === null || value === undefined) {
        return '\u2014'; // em dash
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    const str = String(value);
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

/**
 * Format a cell value for display (alias for formatValue with different defaults)
 */
export function formatCellValue(value: any): string {
    return formatValue(value, 50);
}

// =============================================================================
// NUMBER FORMATTING
// =============================================================================

/**
 * Format a number with thousands separators
 */
export function formatNumber(value: number, locale = 'en-US'): string {
    return value.toLocaleString(locale);
}

/**
 * Format a number as a percentage
 */
export function formatPercent(value: number, decimals = 1): string {
    return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a number as currency
 */
export function formatCurrency(value: number, currency = 'USD', locale = 'en-US'): string {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
    }).format(value);
}

/**
 * Format bytes to human readable format
 */
export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// =============================================================================
// DATE FORMATTING
// =============================================================================

/**
 * Format a date for display
 */
export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '\u2014';

    const defaultOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    };

    return d.toLocaleDateString('en-US', options || defaultOptions);
}

/**
 * Format a date with time
 */
export function formatDateTime(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '\u2014';

    const defaultOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    };

    return d.toLocaleString('en-US', options || defaultOptions);
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | number): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '\u2014';

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;

    return formatDate(d);
}

/**
 * Format a duration in milliseconds to human readable format
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// =============================================================================
// STRING FORMATTING
// =============================================================================

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Convert a string to title case
 */
export function toTitleCase(str: string): string {
    return str.replace(
        /\w\S*/g,
        txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
}

/**
 * Convert a string from camelCase or snake_case to Title Case
 */
export function humanize(str: string): string {
    return str
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Pluralize a word based on count
 */
export function pluralize(word: string, count: number, plural?: string): string {
    if (count === 1) return word;
    return plural || word + 's';
}

// =============================================================================
// ID GENERATION
// =============================================================================

let idCounter = 0;

/**
 * Generate a unique ID with an optional prefix.
 * Uses a combination of timestamp and counter for uniqueness.
 * More reliable than Date.now() alone for rapid successive calls.
 */
export function generateId(prefix = ''): string {
    idCounter = (idCounter + 1) % 1000000;
    const timestamp = Date.now().toString(36);
    const counter = idCounter.toString(36).padStart(4, '0');
    const random = Math.random().toString(36).substring(2, 6);
    const id = `${timestamp}${counter}${random}`;
    return prefix ? `${prefix}-${id}` : id;
}

/**
 * Generate a unique node ID for pipeline editor
 */
export function generateNodeId(): string {
    return generateId('node');
}

/**
 * Generate a unique edge ID for pipeline editor
 */
export function generateEdgeId(): string {
    return generateId('edge');
}

/**
 * Generate a unique step ID for pipeline definition
 */
export function generateStepId(stepType?: string): string {
    return generateId(stepType || 'step');
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Extract error message from unknown error type
 * Replaces verbose `err instanceof Error ? err.message : 'Unknown error'` pattern
 */
export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message: unknown }).message);
    }
    return fallback;
}

/**
 * Wrap an error with a consistent Error object
 * Useful for catch blocks that need to rethrow or log
 */
export function toError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }
    return new Error(getErrorMessage(error));
}
