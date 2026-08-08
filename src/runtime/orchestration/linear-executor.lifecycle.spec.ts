import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import type { DomainEventsService } from '../../services/events/domain-events.service';
import type { HookService } from '../../services/events/hook.service';
import { StepType, type PipelineDefinition } from '../../types';
import type {
    ExportExecutor,
    FeedExecutor,
    GateExecutor,
    LoadExecutor,
    SinkExecutor,
    TransformExecutor,
} from '../executors';
import type { RecordObject } from '../executor-types';
import {
    executeLinear,
    type LinearExecutorParams,
} from './linear-executor';

const SOURCE_RECORD = { sku: 'SKU-1' };
type OnStepFailed = NonNullable<
    NonNullable<LinearExecutorParams['stepLog']>['onStepFailed']
>;

function createDefinition(
    steps: PipelineDefinition['steps'],
): PipelineDefinition {
    return { version: 1, name: 'Lifecycle pipeline', steps };
}

function createFixture(
    definition: PipelineDefinition,
    options: {
        extract?: () => Promise<RecordObject[]>;
        gate?: GateExecutor['execute'];
        onCancelRequested?: () => Promise<boolean>;
        onStepFailed?: OnStepFailed;
    } = {},
) {
    const publish = vi.fn();
    const domainEvents = {
        publish,
        publishStepStarted: vi.fn(),
        publishStepCompleted: vi.fn(),
        publishStepFailed: vi.fn(),
        publishRunProgress: vi.fn(),
        publishGateApprovalRequested: vi.fn(),
    };
    const hookService = {
        run: vi.fn(async () => undefined),
        runInterceptors: vi.fn(async (
            _ctx: RequestContext,
            _definition: PipelineDefinition,
            _stage: string,
            records: RecordObject[],
        ) => ({ records })),
    };
    const extract = vi.fn(options.extract ?? (async () => [SOURCE_RECORD]));
    const loadWithThroughput = vi.fn(async () => ({
        ok: 1,
        fail: 0,
        skipped: 0,
    }));

    const params: LinearExecutorParams = {
        ctx: {} as RequestContext,
        definition,
        executorCtx: {
            cpData: {},
            cpDirty: false,
            markCheckpointDirty: vi.fn(),
        },
        hookService: hookService as unknown as HookService,
        domainEvents: domainEvents as unknown as DomainEventsService,
        extractExecutor: { execute: extract } as never,
        transformExecutor: {} as TransformExecutor,
        loadExecutor: {} as LoadExecutor,
        exportExecutor: {} as ExportExecutor,
        feedExecutor: {} as FeedExecutor,
        sinkExecutor: {} as SinkExecutor,
        gateExecutor: {
            execute: options.gate ?? vi.fn(),
        } as unknown as GateExecutor,
        loadWithThroughput,
        applyIdempotency: records => records,
        onCancelRequested: options.onCancelRequested,
        pipelineId: 11,
        pipelineCode: 'lifecycle-pipeline',
        runId: 22,
        stepLog: options.onStepFailed
            ? { onStepFailed: options.onStepFailed }
            : undefined,
    };

    return {
        domainEvents,
        extract,
        hookService,
        loadWithThroughput,
        params,
        publish,
    };
}

describe('linear executor lifecycle', () => {
    it('cancels before a step and emits one run cancellation event', async () => {
        const fixture = createFixture(createDefinition([{
            key: 'source',
            type: StepType.EXTRACT,
            config: { adapterCode: 'test-source' },
        }]), {
            onCancelRequested: vi.fn(async () => true),
        });

        const result = await executeLinear(fixture.params);

        expect(result).toMatchObject({ cancelled: true, processed: 0 });
        expect(fixture.extract).not.toHaveBeenCalled();
        expect(fixture.domainEvents.publishStepStarted).not.toHaveBeenCalled();
        expect(fixture.publish.mock.calls.filter(([name]) => (
            name === 'PipelineRunCancelled'
        ))).toEqual([[
            'PipelineRunCancelled',
            expect.objectContaining({ pipelineId: 11, runId: 22, stepKey: 'source' }),
        ]]);
        expect(fixture.publish).toHaveBeenCalledWith('PipelineStepSkipped', {
            pipelineId: 11,
            stepKey: 'source',
            reason: 'cancelled',
        });
    });

    it('retains cancellation first observed after the final step', async () => {
        const onCancelRequested = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        const fixture = createFixture(createDefinition([{
            key: 'source',
            type: StepType.EXTRACT,
            config: { adapterCode: 'test-source' },
        }]), { onCancelRequested });

        const result = await executeLinear(fixture.params);

        expect(result.cancelled).toBe(true);
        expect(onCancelRequested).toHaveBeenCalledTimes(2);
        expect(fixture.domainEvents.publishStepCompleted).toHaveBeenCalledOnce();
        expect(fixture.publish.mock.calls.filter(([name]) => (
            name === 'PipelineRunCancelled'
        ))).toHaveLength(1);
        expect(fixture.publish).not.toHaveBeenCalledWith(
            'PipelineStepSkipped',
            expect.anything(),
        );
    });

    it('fails closed for an unsupported runtime step type', async () => {
        const onStepFailed = vi.fn(async () => {
            throw new Error('failure logging unavailable');
        });
        const fixture = createFixture(createDefinition([{
            key: 'unknown',
            type: 'UNKNOWN' as StepType,
            config: {},
        }]), { onStepFailed });

        await expect(executeLinear(fixture.params)).rejects.toThrow(
            'Unsupported step type "UNKNOWN" for step "unknown"',
        );

        expect(fixture.domainEvents.publishStepStarted).toHaveBeenCalledOnce();
        expect(fixture.domainEvents.publishStepCompleted).not.toHaveBeenCalled();
        expect(fixture.domainEvents.publishStepFailed).toHaveBeenCalledWith(
            '11',
            '22',
            'unknown',
            'UNKNOWN',
            'Unsupported step type "UNKNOWN" for step "unknown"',
        );
        expect(onStepFailed).toHaveBeenCalledWith(
            fixture.params.ctx,
            'unknown',
            'UNKNOWN',
            expect.objectContaining({
                message: 'Unsupported step type "UNKNOWN" for step "unknown"',
            }),
            expect.any(Number),
        );
        expect(fixture.publish).not.toHaveBeenCalledWith(
            'PipelineStepSkipped',
            expect.anything(),
        );
    });

    it('normalizes non-Error step failures before publishing and rethrowing', async () => {
        const onStepFailed = vi.fn<OnStepFailed>(async () => undefined);
        const fixture = createFixture(createDefinition([{
            key: 'source',
            type: StepType.EXTRACT,
            config: { adapterCode: 'test-source' },
        }]), {
            extract: () => Promise.reject('source unavailable'),
            onStepFailed,
        });

        await expect(executeLinear(fixture.params)).rejects.toThrow(
            'source unavailable',
        );
        expect(fixture.domainEvents.publishStepFailed).toHaveBeenCalledWith(
            '11',
            '22',
            'source',
            StepType.EXTRACT,
            'source unavailable',
        );
        expect(onStepFailed.mock.calls[0]?.[3]).toEqual(
            expect.objectContaining({ message: 'source unavailable' }),
        );
    });

    it('emits lifecycle and explicit skip events for trigger configuration steps', async () => {
        const fixture = createFixture(createDefinition([{
            key: 'trigger',
            type: StepType.TRIGGER,
            config: { triggerType: 'MANUAL' },
        }]));

        const result = await executeLinear(fixture.params);

        expect(result).toMatchObject({ processed: 0, failed: 0 });
        expect(fixture.domainEvents.publishStepStarted).toHaveBeenCalledWith(
            '11',
            '22',
            'trigger',
            StepType.TRIGGER,
        );
        expect(fixture.domainEvents.publishStepCompleted).toHaveBeenCalledWith(
            '11',
            '22',
            'trigger',
            StepType.TRIGGER,
            0,
        );
        expect(fixture.publish).toHaveBeenCalledWith('PipelineStepSkipped', {
            pipelineId: 11,
            stepKey: 'trigger',
            reason: 'trigger-step',
        });
    });

    it('pauses at a gate without executing subsequent steps', async () => {
        const gate = vi.fn<GateExecutor['execute']>(async (
            _ctx,
            _step,
            records,
        ) => ({
            stepKey: 'approval',
            paused: true,
            pendingRecords: records,
            previewRecords: records,
            config: { approvalType: 'MANUAL' },
        }));
        const fixture = createFixture(createDefinition([
            {
                key: 'source',
                type: StepType.EXTRACT,
                config: { adapterCode: 'test-source' },
            },
            {
                key: 'approval',
                type: StepType.GATE,
                config: { approvalType: 'MANUAL' },
            },
            {
                key: 'target',
                type: StepType.LOAD,
                config: { adapterCode: 'test-loader' },
            },
        ]), { gate });

        const result = await executeLinear(fixture.params);

        expect(result).toMatchObject({
            paused: true,
            pausedAtStep: 'approval',
        });
        expect(fixture.loadWithThroughput).not.toHaveBeenCalled();
        expect(fixture.domainEvents.publishGateApprovalRequested).toHaveBeenCalledWith(
            '11',
            '22',
            'approval',
        );
        expect(fixture.publish).toHaveBeenCalledWith(
            'PipelinePaused',
            expect.objectContaining({ pipelineId: 11, runId: 22, stepKey: 'approval' }),
        );
    });
});
