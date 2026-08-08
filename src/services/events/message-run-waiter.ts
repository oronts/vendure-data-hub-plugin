import type { ID } from '@vendure/core';
import { QUEUE, RunStatus } from '../../constants';
import type { PipelineRun } from '../../entities/pipeline';
import { sleep } from '../../utils/retry.utils';

type RunSnapshot = Pick<PipelineRun, 'status' | 'error'>;

export type LoadPipelineRun = (runId: ID) => Promise<RunSnapshot | null>;

export interface QueueRunWaitOptions {
    intervalMs?: number;
    timeoutMs?: number;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    beforePoll?: () => void;
}

export class QueueRunWaitTimeoutError extends Error {
    constructor(runId: ID, timeoutMs: number) {
        super(`Queue-triggered pipeline run ${String(runId)} did not complete within ${timeoutMs}ms`);
        this.name = 'QueueRunWaitTimeoutError';
    }
}

export async function waitForSuccessfulQueueRun(
    runId: ID,
    loadRun: LoadPipelineRun,
    options: QueueRunWaitOptions = {},
): Promise<void> {
    const intervalMs = options.intervalMs ?? QUEUE.RUN_STATUS_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? QUEUE.RUN_STATUS_WAIT_TIMEOUT_MS;
    const now = options.now ?? Date.now;
    const delay = options.delay ?? sleep;
    const beforePoll = options.beforePoll ?? (() => undefined);
    const deadline = now() + timeoutMs;

    let remainingMs = timeoutMs;
    do {
        beforePoll();
        const run = await loadRun(runId);
        if (!run) {
            throw new Error(`Queue-triggered pipeline run ${String(runId)} was not found`);
        }
        if (run.status === RunStatus.COMPLETED) return;
        if (isTerminalFailure(run.status)) {
            const detail = run.error ? `: ${run.error}` : '';
            throw new Error(
                `Queue-triggered pipeline run ${String(runId)} ended with ${run.status}${detail}`,
            );
        }

        remainingMs = deadline - now();
        if (remainingMs <= 0) {
            break;
        }
        await delay(Math.min(intervalMs, remainingMs));
        beforePoll();
    } while (remainingMs > 0);

    throw new QueueRunWaitTimeoutError(runId, timeoutMs);
}

function isTerminalFailure(status: RunStatus): boolean {
    return status === RunStatus.FAILED ||
        status === RunStatus.TIMEOUT ||
        status === RunStatus.CANCELLED;
}
