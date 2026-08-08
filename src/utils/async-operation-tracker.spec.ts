import { describe, expect, it } from 'vitest';
import { ActiveTaskSet, SingleFlightTask } from './async-operation-tracker';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

describe('async operation tracking', () => {
    it('shares one active single-flight operation', async () => {
        const task = new SingleFlightTask<number>();
        const pending = deferred<number>();
        let starts = 0;
        const operation = () => {
            starts++;
            return pending.promise;
        };

        const first = task.run(operation);
        const second = task.run(operation);
        expect(first).toBe(second);
        expect(task.running).toBe(true);
        expect(starts).toBe(1);
        pending.resolve(42);
        await expect(first).resolves.toBe(42);
        await task.settle();
        expect(task.running).toBe(false);
    });

    it('settles rejected work and accepts the next operation', async () => {
        const task = new SingleFlightTask<void>();
        const pending = deferred<void>();
        const failure = task.run(() => pending.promise);
        pending.reject(new Error('failed'));

        await expect(failure).rejects.toThrow('failed');
        await expect(task.settle()).resolves.toBeUndefined();
        await expect(task.run(async () => undefined)).resolves.toBeUndefined();
    });

    it('waits for every active task', async () => {
        const tasks = new ActiveTaskSet();
        const first = deferred<void>();
        const second = deferred<void>();
        const firstOperation = tasks.run(() => first.promise);
        const secondOperation = tasks.run(() => second.promise);
        let settled = false;
        const settling = tasks.settle().then(() => {
            settled = true;
        });

        first.resolve();
        await firstOperation;
        expect(settled).toBe(false);
        second.resolve();
        await Promise.all([secondOperation, settling]);
        expect(settled).toBe(true);
    });
});
