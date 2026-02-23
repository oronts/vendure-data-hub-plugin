const LOG_LEVEL_COLORS = {
    debug: 'bg-gray-100 text-gray-600',
    info: 'bg-blue-100 text-blue-600',
    warn: 'bg-amber-100 text-amber-600',
    error: 'bg-red-100 text-red-600',
} as const;

export const FALLBACK_COLORS = {
    MUTED: '#6b7280',
    BORDER: '#e5e7eb',
    UNKNOWN_STEP_COLOR: '#666666',
    UNKNOWN_STEP_BG: '#f5f5f5',
    UNKNOWN_STEP_BORDER: '#cccccc',
} as const;

export const BRANCH_COLORS = {
    TRUE: '#22c55e',
    FALSE: '#ef4444',
} as const;

export function getLogLevelColor(level: string): string {
    const key = level.toLowerCase() as keyof typeof LOG_LEVEL_COLORS;
    return LOG_LEVEL_COLORS[key] ?? LOG_LEVEL_COLORS.info;
}

