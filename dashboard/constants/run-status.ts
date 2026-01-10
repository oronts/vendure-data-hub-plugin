/**
 * Run Status Constants
 * Pipeline run status definitions and visual configurations
 */

// Run status constants
export const RUN_STATUS = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
} as const;

export type RunStatus = typeof RUN_STATUS[keyof typeof RUN_STATUS];

// Run status configuration interface
export interface RunStatusConfig {
    readonly status: RunStatus;
    readonly label: string;
    readonly color: string;
    readonly bgColor: string;
    readonly icon: string;
}

// Run status configuration mapping
export const RUN_STATUS_CONFIGS: Record<RunStatus, RunStatusConfig> = {
    PENDING: {
        status: 'PENDING',
        label: 'Pending',
        color: '#6B7280',
        bgColor: '#F3F4F6',
        icon: 'Clock',
    },
    RUNNING: {
        status: 'RUNNING',
        label: 'Running',
        color: '#3B82F6',
        bgColor: '#EFF6FF',
        icon: 'Loader2',
    },
    COMPLETED: {
        status: 'COMPLETED',
        label: 'Completed',
        color: '#10B981',
        bgColor: '#ECFDF5',
        icon: 'CheckCircle',
    },
    FAILED: {
        status: 'FAILED',
        label: 'Failed',
        color: '#EF4444',
        bgColor: '#FEF2F2',
        icon: 'XCircle',
    },
    CANCELLED: {
        status: 'CANCELLED',
        label: 'Cancelled',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        icon: 'Ban',
    },
};
