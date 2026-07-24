import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { DISTRIBUTED_LOCK } from '../../constants';
import { RunStatus } from '../../constants/enums';
import type { PipelineRun } from '../../entities/pipeline';
import type { PipelineMetrics } from '../../types';
import type { DataHubLogger, SpanContext } from '../logger';
import { PipelineRunnerService } from './pipeline-runner.service';

function createFixture() {
    const failure = new Error('temporary upstream failure');
    const run = {
        id: 42,
        status: RunStatus.RUNNING,
        finishedAt: null,
        error: null,
        pipeline: { id: 7, code: 'catalog-sync' },
        definitionSnapshot: { version: 1, steps: [] },
    } as unknown as PipelineRun;
    const runRepo = {
        save: vi.fn(async (entity: PipelineRun) => entity),
    } as unknown as Repository<PipelineRun>;
    const runLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        logPipelineFailed: vi.fn(),
    } as unknown as DataHubLogger;
    const pipelineSpan = {
        addEvent: vi.fn(),
        end: vi.fn(),
    } as unknown as SpanContext;
    const domainEvents = {
        publishRunFailed: vi.fn(),
    };
    const hookService = {
        run: vi.fn(async () => undefined),
    };
    const executionLogger = {
        logPipelineFailed: vi.fn(async () => undefined),
    };
    const loggerFactory = {
        createLogger: vi.fn(() => runLogger),
    };
    const runner = new PipelineRunnerService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        domainEvents as never,
        hookService as never,
        loggerFactory as never,
        executionLogger as never,
    );
    const executionContext = {
        ctx: {},
        run,
        runId: run.id,
        runRepo,
        runLogger,
        pipelineSpan,
        startTime: Date.now(),
        lockKey: 'pipeline-exec:7',
        lockToken: undefined as string | undefined,
        lockRefreshTimer: undefined as NodeJS.Timeout | undefined,
        lockLossError: undefined as Error | undefined,
    };

    vi.spyOn(runner as never, 'prepareExecution' as never).mockResolvedValue({
        proceed: true,
        executionContext,
    } as never);
    const executeSteps = vi.spyOn(runner as never, 'executeSteps' as never).mockRejectedValue(failure);
    const releaseLock = vi.spyOn(runner as never, 'releaseLock' as never).mockResolvedValue(undefined as never);

    return {
        runner,
        executionContext,
        executeSteps,
        failure,
        run,
        runRepo,
        runLogger,
        pipelineSpan,
        domainEvents,
        hookService,
        executionLogger,
        releaseLock,
    };
}

describe('PipelineRunnerService queue attempts', () => {
    it('returns a failed attempt to PENDING, releases the lock, and rethrows for retry', async () => {
        const fixture = createFixture();

        await expect(fixture.runner.execute(42, {
            attempt: 1,
            maxAttempts: 3,
        })).rejects.toBe(fixture.failure);

        expect(fixture.run.status).toBe(RunStatus.PENDING);
        expect(fixture.run.finishedAt).toBeNull();
        expect(fixture.run.error).toBe(fixture.failure.message);
        expect(fixture.runRepo.save).toHaveBeenCalledOnce();
        expect(fixture.runLogger.warn).toHaveBeenCalledWith(
            'Pipeline execution attempt failed; queued job will retry',
            expect.objectContaining({ attempt: 1, maxAttempts: 3 }),
        );
        expect(fixture.domainEvents.publishRunFailed).not.toHaveBeenCalled();
        expect(fixture.executionLogger.logPipelineFailed).not.toHaveBeenCalled();
        expect(fixture.hookService.run).not.toHaveBeenCalled();
        expect(fixture.releaseLock).toHaveBeenCalledOnce();
    });

    it('marks only the final attempt FAILED and emits terminal failure signals', async () => {
        const fixture = createFixture();

        await expect(fixture.runner.execute(42, {
            attempt: 3,
            maxAttempts: 3,
        })).rejects.toBe(fixture.failure);

        expect(fixture.run.status).toBe(RunStatus.FAILED);
        expect(fixture.run.finishedAt).toBeInstanceOf(Date);
        expect(fixture.run.metrics?.durationMs).toBeGreaterThanOrEqual(0);
        expect(fixture.domainEvents.publishRunFailed).toHaveBeenCalledWith(
            '42',
            'catalog-sync',
            fixture.failure.message,
        );
        expect(fixture.executionLogger.logPipelineFailed).toHaveBeenCalledOnce();
        expect(fixture.runLogger.logPipelineFailed).toHaveBeenCalledOnce();
        expect(fixture.hookService.run).toHaveBeenCalledOnce();
        expect(fixture.pipelineSpan.end).toHaveBeenCalledWith('error');
        expect(fixture.releaseLock).toHaveBeenCalledOnce();
    });
    it('rejects completed step results when the execution lease was lost', async () => {
        const fixture = createFixture();
        const lockLossError = new Error('Pipeline execution lock was lost');
        fixture.executionContext.lockLossError = lockLossError;
        fixture.executeSteps.mockResolvedValue({
            totalRecords: 1,
            processed: 1,
            succeeded: 1,
            failed: 0,
            durationMs: 10,
        } as never);

        await expect(fixture.runner.execute(42, {
            attempt: 1,
            maxAttempts: 3,
        })).rejects.toBe(lockLossError);

        expect(fixture.run.status).toBe(RunStatus.PENDING);
        expect(fixture.run.error).toBe(lockLossError.message);
        expect(fixture.releaseLock).toHaveBeenCalledOnce();
    });
});

describe('PipelineRunnerService published adapter contract', () => {
    it('validates immutable bindings before invoking the adapter runtime', async () => {
        const validationError = new Error('Published pipeline definition is missing adapter bindings');
        const definitionValidator = {
            validate: vi.fn(() => {
                throw validationError;
            }),
        };
        const adapterRuntime = { executePipeline: vi.fn() };
        const runner = new PipelineRunnerService(
            {} as never,
            {} as never,
            definitionValidator as never,
            adapterRuntime as never,
            {} as never,
            {} as never,
            {} as never,
            { createLogger: vi.fn(() => ({})) } as never,
            {} as never,
        );
        const definitionSnapshot = {
            version: 1,
            steps: [{
                key: 'load',
                type: 'LOAD',
                config: { adapterCode: 'productUpsert' },
            }],
        };
        const executionContext = {
            ctx: {},
            run: {
                id: 42,
                pipeline: { id: 7, code: 'catalog-sync' },
                definitionSnapshot,
            },
            runId: 42,
            runLogger: {},
            pipelineSpan: { addEvent: vi.fn() },
        };
        const internals = runner as unknown as {
            executeSteps(context: typeof executionContext): Promise<PipelineMetrics>;
        };

        await expect(internals.executeSteps(executionContext)).rejects.toBe(validationError);

        expect(definitionValidator.validate).toHaveBeenCalledWith(
            definitionSnapshot,
            { requireAdapterBindings: true },
        );
        expect(adapterRuntime.executePipeline).not.toHaveBeenCalled();
    });
});

describe('PipelineRunnerService paused gate persistence', () => {
    it('persists the selected gate and timeout from the immutable definition', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
        try {
            const fixture = createFixture();
            fixture.run.definitionSnapshot = {
                version: 1,
                steps: [{
                    key: 'approval',
                    type: 'GATE',
                    config: { approvalType: 'TIMEOUT', timeoutSeconds: 45 },
                }],
            };
            fixture.run.gateTimeoutLeaseToken = 'stale-token';
            fixture.run.gateTimeoutLeaseExpiresAt = new Date();
            const metrics = {
                paused: true,
                pausedAtStep: 'approval',
            } as PipelineMetrics;
            const internals = fixture.runner as unknown as {
                handlePaused(
                    executionContext: typeof fixture.executionContext,
                    runMetrics: PipelineMetrics,
                ): Promise<void>;
            };

            await internals.handlePaused(fixture.executionContext, metrics);

            expect(fixture.run.status).toBe(RunStatus.PAUSED);
            expect(fixture.run.gateStepKey).toBe('approval');
            expect(fixture.run.gateTimeoutAt?.toISOString()).toBe(
                '2026-07-22T10:00:45.000Z',
            );
            expect(fixture.run.gateTimeoutLeaseToken).toBeNull();
            expect(fixture.run.gateTimeoutLeaseExpiresAt).toBeNull();
            expect(fixture.runRepo.save).toHaveBeenCalledWith(
                fixture.run,
                { reload: false },
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('refuses to persist an unactionable paused run', async () => {
        const fixture = createFixture();
        const metrics = {
            paused: true,
            pausedAtStep: 'missing-gate',
        } as PipelineMetrics;
        const internals = fixture.runner as unknown as {
            handlePaused(
                executionContext: typeof fixture.executionContext,
                runMetrics: PipelineMetrics,
            ): Promise<void>;
        };

        await expect(
            internals.handlePaused(fixture.executionContext, metrics),
        ).rejects.toThrow('without an actionable GATE step');

        expect(fixture.run.status).toBe(RunStatus.RUNNING);
        expect(fixture.runRepo.save).not.toHaveBeenCalled();
    });
});

describe('PipelineRunnerService lease renewal', () => {
    it('marks the execution unsafe and stops refreshing when renewal loses ownership', async () => {
        vi.useFakeTimers();
        try {
            const fixture = createFixture();
            const distributedLock = {
                extend: vi.fn().mockResolvedValue(false),
            };
            const internals = fixture.runner as unknown as {
                distributedLock: typeof distributedLock;
                startLockRefresh(executionContext: unknown): void;
            };
            internals.distributedLock = distributedLock;
            fixture.executionContext.lockToken = 'worker-token';

            internals.startLockRefresh(fixture.executionContext);
            await vi.advanceTimersByTimeAsync(
                DISTRIBUTED_LOCK.PIPELINE_LOCK_REFRESH_MS,
            );

            expect(distributedLock.extend).toHaveBeenCalledWith(
                'pipeline-exec:7',
                'worker-token',
                DISTRIBUTED_LOCK.PIPELINE_LOCK_TTL_MS,
            );
            expect(fixture.executionContext.lockLossError?.message).toBe(
                'Pipeline execution lock was lost',
            );
            expect(fixture.executionContext.lockRefreshTimer).toBeUndefined();
            expect(fixture.runLogger.error).toHaveBeenCalledWith(
                'Pipeline execution lock was lost',
                fixture.executionContext.lockLossError,
                { lockKey: 'pipeline-exec:7' },
            );
        } finally {
            vi.useRealTimers();
        }
    });
});
