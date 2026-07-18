import { describe, expect, it } from 'vitest';
import { RUN_STATUS } from '../constants';
import { isTerminalRunStatus, shouldPollRunStatus } from './run-status';

describe('run status helpers', () => {
    it.each([
        RUN_STATUS.COMPLETED,
        RUN_STATUS.FAILED,
        RUN_STATUS.CANCELLED,
        RUN_STATUS.TIMEOUT,
    ])('recognizes %s as terminal', status => {
        expect(isTerminalRunStatus(status)).toBe(true);
        expect(shouldPollRunStatus(status)).toBe(false);
    });

    it.each([
        RUN_STATUS.PENDING,
        RUN_STATUS.RUNNING,
        RUN_STATUS.PAUSED,
        RUN_STATUS.CANCEL_REQUESTED,
        'FUTURE_NON_TERMINAL_STATUS',
    ])('continues polling %s', status => {
        expect(isTerminalRunStatus(status)).toBe(false);
        expect(shouldPollRunStatus(status)).toBe(true);
    });

    it.each([null, undefined])('does not poll before a status is available: %s', status => {
        expect(isTerminalRunStatus(status)).toBe(false);
        expect(shouldPollRunStatus(status)).toBe(false);
    });
});
