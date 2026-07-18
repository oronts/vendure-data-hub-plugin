import { RUN_STATUS } from '../constants';

const TERMINAL_RUN_STATUSES = new Set<string>([
    RUN_STATUS.COMPLETED,
    RUN_STATUS.FAILED,
    RUN_STATUS.CANCELLED,
    RUN_STATUS.TIMEOUT,
]);

export function isTerminalRunStatus(
    status: string | null | undefined,
): boolean {
    return status != null && TERMINAL_RUN_STATUSES.has(status);
}

export function shouldPollRunStatus(
    status: string | null | undefined,
): boolean {
    return status != null && !isTerminalRunStatus(status);
}
