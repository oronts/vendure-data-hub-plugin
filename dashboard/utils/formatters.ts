import type { JsonValue } from '../../shared/types';

export function formatValue(value: JsonValue, maxLength = 50): string {
    if (value === null || value === undefined) {
        return '\u2014';
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

export function formatCellValue(value: JsonValue): string {
    return formatValue(value, 50);
}

export function formatKey(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return '\u2014';

    const defaultOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    };

    return dateObj.toLocaleDateString('en-US', options || defaultOptions);
}

export function formatDateTime(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return '\u2014';

    const defaultOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    };

    return dateObj.toLocaleString('en-US', options || defaultOptions);
}

export function formatSmartDateTime(date: Date | string | number): string {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return '\u2014';

    const now = new Date();
    const isToday = dateObj.toDateString() === now.toDateString();

    if (isToday) {
        return dateObj.toLocaleTimeString();
    }
    return dateObj.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatDiffValue(value: unknown, maxLength = 50): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return `{${Object.keys(value).length} keys}`;
    return String(value);
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
    return classes.filter((c): c is string => typeof c === 'string' && c.length > 0).join(' ');
}

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
        return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatCompactNumber(num: number): string {
    if (num < 1000) return num.toString();
    if (num < 1_000_000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    if (num < 1_000_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    return `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
