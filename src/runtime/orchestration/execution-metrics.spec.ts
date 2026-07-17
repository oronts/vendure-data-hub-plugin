import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import type { PipelineDefinition } from '../../types';
import { StepType } from '../../types';
import type { DomainEventsService } from '../../services/events/domain-events.service';
import type { HookService } from '../../services/events/hook.service';
import type {
    ExportExecutor,
    FeedExecutor,
    GateExecutor,
    LoadExecutor,
    SinkExecutor,
    TransformExecutor,
} from '../executors';
import type { RecordObject } from '../executor-types';
import { executeLinear, type LinearExecutorParams } from './linear-executor';

const SOURCE_RECORD = { sku: 'SKU-1' };

function createParams(options: {
    loadResult: { ok: number; fail: number; skipped: number };
    applyIdempotency?: (records: RecordObject[]) => RecordObject[];
}): LinearExecutorParams {
    const definition = {
        version: 1,
        steps: [
            {
                key: 'source',
                type: StepType.EXTRACT,
                config: { adapterCode: 'test-source' },
            },
            {
                key: 'target',
                type: StepType.LOAD,
                config: { adapterCode: 'test-loader' },
            },
        ],
    } as PipelineDefinition;
    const hookService = {
        run: vi.fn(async () => undefined),
        runInterceptors: vi.fn(async (...args: unknown[]) => ({
            records: args[3] as RecordObject[],
        })),
    } as unknown as HookService;
    const domainEvents = {
        publish: vi.fn(),
        publishStepStarted: vi.fn(),
        publishStepCompleted: vi.fn(),
        publishStepFailed: vi.fn(),
        publishRunProgress: vi.fn(),
    } as unknown as DomainEventsService;

    return {
        ctx: {} as RequestContext,
        definition,
        executorCtx: {
            cpData: {},
            cpDirty: false,
            markCheckpointDirty: vi.fn(),
        },
        hookService,
        domainEvents,
        extractExecutor: {
            execute: vi.fn(async () => [SOURCE_RECORD]),
        } as never,
        transformExecutor: {} as TransformExecutor,
        loadExecutor: {} as LoadExecutor,
        exportExecutor: {} as ExportExecutor,
        feedExecutor: {} as FeedExecutor,
        sinkExecutor: {} as SinkExecutor,
        gateExecutor: {} as GateExecutor,
        loadWithThroughput: vi.fn(async () => options.loadResult),
        applyIdempotency: options.applyIdempotency ?? (records => records),
    };
}

describe('linear execution metrics', () => {
    it('counts terminal record outcomes without double-counting extraction', async () => {
        const result = await executeLinear(createParams({
            loadResult: { ok: 1, fail: 0, skipped: 0 },
        }));

        expect(result).toMatchObject({
            processed: 1,
            succeeded: 1,
            failed: 0,
            skipped: 0,
        });
        expect(result.counters).toMatchObject({
            extracted: 1,
            loaded: 1,
            rejected: 0,
        });
    });

    it('counts records removed by idempotency as skipped terminal outcomes', async () => {
        const result = await executeLinear(createParams({
            loadResult: { ok: 0, fail: 0, skipped: 0 },
            applyIdempotency: () => [],
        }));

        expect(result).toMatchObject({
            processed: 1,
            succeeded: 0,
            failed: 0,
            skipped: 1,
        });
        expect(result.counters).toMatchObject({
            extracted: 1,
            loaded: 0,
            skipped: 1,
            idempotencySkipped: 1,
        });
    });
});
