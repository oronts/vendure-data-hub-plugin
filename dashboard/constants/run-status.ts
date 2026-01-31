import type { RunStatus } from '../../shared/types';

export const RUN_STATUS = {
    PENDING: 'PENDING',
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    TIMEOUT: 'TIMEOUT',
    CANCELLED: 'CANCELLED',
    CANCEL_REQUESTED: 'CANCEL_REQUESTED',
} as const satisfies Record<string, RunStatus>;

export type { RunStatus } from '../../shared/types';

export interface RunStatusConfig {
    readonly status: RunStatus;
    readonly label: string;
    readonly color: string;
    readonly bgColor: string;
    readonly icon: string;
}

export const RUN_STATUS_CONFIGS: Record<RunStatus, RunStatusConfig> = {
    PENDING: {
        status: 'PENDING',
        label: 'Pending',
        color: '#6B7280',
        bgColor: '#F3F4F6',
        icon: 'Clock',
    },
    QUEUED: {
        status: 'QUEUED',
        label: 'Queued',
        color: '#8B5CF6',
        bgColor: '#F5F3FF',
        icon: 'List',
    },
    RUNNING: {
        status: 'RUNNING',
        label: 'Running',
        color: '#3B82F6',
        bgColor: '#EFF6FF',
        icon: 'Loader2',
    },
    PAUSED: {
        status: 'PAUSED',
        label: 'Paused',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        icon: 'Pause',
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
    TIMEOUT: {
        status: 'TIMEOUT',
        label: 'Timeout',
        color: '#EF4444',
        bgColor: '#FEF2F2',
        icon: 'Timer',
    },
    CANCELLED: {
        status: 'CANCELLED',
        label: 'Cancelled',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        icon: 'Ban',
    },
    CANCEL_REQUESTED: {
        status: 'CANCEL_REQUESTED',
        label: 'Cancelling',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        icon: 'Clock',
    },
};
