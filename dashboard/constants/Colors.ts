import {
    AlertTriangle,
    CheckCircle,
    Info,
    XCircle,
    FileText,
    FileSpreadsheet,
    FileJson,
    File,
    type LucideIcon,
} from 'lucide-react';

const LOG_LEVEL_COLORS = {
    debug: 'bg-gray-100 text-gray-600',
    info: 'bg-blue-100 text-blue-600',
    warn: 'bg-amber-100 text-amber-600',
    error: 'bg-red-100 text-red-600',
} as const;

const LOG_LEVEL_CONFIG = {
    DEBUG: { icon: Info, color: 'text-gray-500', bg: 'bg-gray-100' },
    INFO: { icon: CheckCircle, color: 'text-blue-500', bg: 'bg-blue-100' },
    WARN: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100' },
    ERROR: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100' },
} as const satisfies Record<string, { icon: LucideIcon; color: string; bg: string }>;

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

export const FILE_TYPE_ICON_CONFIG: Record<string, { icon: LucideIcon; color: string }> = {
    CSV: { icon: FileText, color: 'text-blue-500' },
    XLSX: { icon: FileSpreadsheet, color: 'text-green-500' },
    JSON: { icon: FileJson, color: 'text-yellow-500' },
    XML: { icon: File, color: 'text-orange-500' },
};

export type LogLevel = keyof typeof LOG_LEVEL_CONFIG;

export function getLogLevelColor(level: string): string {
    const key = level.toLowerCase() as keyof typeof LOG_LEVEL_COLORS;
    return LOG_LEVEL_COLORS[key] ?? LOG_LEVEL_COLORS.info;
}

