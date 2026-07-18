import { describe, expect, it, vi } from 'vitest';
import { RunStatus } from '../../constants';
import {
    QueueRunWaitTimeoutError,
    waitForSuccessfulQueueRun,
} from './message-run-waiter';

describe('waitForSuccessfulQueueRun', () => {
    it('waits through active states and resolves only on completion', async () => {
        const loadRun = vi.fn()
            .mockResolvedValueOnce({ status: RunStatus.PENDING, error: null })
            .mockResolvedValueOnce({ status: RunStatus.RUNNING, error: null })
            .mockResolvedValueOnce({ status: RunStatus.COMPLETED, error: null });
        const delay = vi.fn().mockResolvedValue(undefined);

        await expect(waitForSuccessfulQueueRun('run-1', loadRun, {
            intervalMs: 5,
            timeoutMs: 20,
            now: createClock([0, 0, 5, 10]),
            delay,
        })).resolves.toBeUndefined();

        expect(loadRun).toHaveBeenCalledTimes(3);
        expect(delay).toHaveBeenCalledTimes(2);
    });

    it.each([RunStatus.FAILED, RunStatus.TIMEOUT, RunStatus.CANCELLED])(
        'rejects the terminal %s outcome without another poll',
        async status => {
            const loadRun = vi.fn().mockResolvedValue({ status, error: 'run stopped' });
            const delay = vi.fn();

            await expect(waitForSuccessfulQueueRun('run-2', loadRun, {
                now: () => 0,
                delay,
            })).rejects.toThrow(`ended with ${status}: run stopped`);

            expect(loadRun).toHaveBeenCalledOnce();
            expect(delay).not.toHaveBeenCalled();
        },
    );

    it('bounds non-terminal waiting', async () => {
        const loadRun = vi.fn().mockResolvedValue({
            status: RunStatus.CANCEL_REQUESTED,
            error: null,
        });
        const delay = vi.fn().mockResolvedValue(undefined);

        await expect(waitForSuccessfulQueueRun('run-3', loadRun, {
            intervalMs: 5,
            timeoutMs: 10,
            now: createClock([0, 0, 5, 10]),
            delay,
        })).rejects.toBeInstanceOf(QueueRunWaitTimeoutError);

        expect(delay).toHaveBeenCalledTimes(2);
    });

    it('checks delivery ownership before every status observation', async () => {
        const ownershipError = new Error('delivery ownership lost');
        const beforePoll = vi.fn(() => {
            if (beforePoll.mock.calls.length >= 2) throw ownershipError;
        });
        const loadRun = vi.fn().mockResolvedValue({
            status: RunStatus.RUNNING,
            error: null,
        });

        await expect(waitForSuccessfulQueueRun('run-4', loadRun, {
            intervalMs: 5,
            timeoutMs: 20,
            now: createClock([0, 0, 5]),
            delay: vi.fn().mockResolvedValue(undefined),
            beforePoll,
        })).rejects.toBe(ownershipError);

        expect(loadRun).toHaveBeenCalledOnce();
    });
});

function createClock(values: number[]): () => number {
    let index = 0;
    return () => values[Math.min(index++, values.length - 1)];
}
