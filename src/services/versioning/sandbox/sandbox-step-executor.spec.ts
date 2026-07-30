import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import {
    LineageOutcome,
    RecordOutcome,
    RecordProcessingState,
    SANDBOX,
    SandboxStepStatus,
} from '../../../constants';
import type { PipelineStepDefinition } from '../../../types';
import type { AdapterRuntimeService } from '../../../runtime/adapter-runtime.service';
import { DataLineageTracker } from './data-lineage-tracker';
import { SandboxStepExecutor } from './sandbox-step-executor';

const options = {
    maxRecords: SANDBOX.MAX_RECORDS,
    maxSamplesPerStep: SANDBOX.MAX_SAMPLES_PER_STEP,
    includeLineage: true,
    seedData: [],
    stopOnError: false,
    timeoutMs: SANDBOX.DEFAULT_TIMEOUT_MS,
    skipSteps: [],
    startFromStep: '',
};

function step(type: 'EXTRACT' | 'TRANSFORM'): PipelineStepDefinition {
    return {
        key: type.toLowerCase(),
        type,
        config: { adapterCode: type === 'EXTRACT' ? 'seed' : 'map' },
    };
}

describe('SandboxStepExecutor', () => {
    it.each([
        ['EXTRACT', []],
        ['TRANSFORM', [{ sku: 'SKU-1' }]],
    ] as const)('fails a %s step when dry run reports an error', async (type, records) => {
        const adapterRuntime = {
            executeDryRun: vi.fn(async () => ({
                metrics: {},
                sampleRecords: [],
                outputRecords: [],
                errors: [{
                    stepKey: type.toLowerCase(),
                    message: 'invalid configuration',
                }],
            })),
        } as unknown as AdapterRuntimeService;
        const executor = new SandboxStepExecutor(adapterRuntime);
        const lineage = new DataLineageTracker(options);

        const result = await executor.executeStep(
            {} as RequestContext,
            step(type),
            [...records],
            options,
            lineage,
        );

        expect(result).toMatchObject({
            status: SandboxStepStatus.ERROR,
            errorMessage: `[${type.toLowerCase()}] invalid configuration`,
            recordsOut: 0,
            recordsErrored: records.length,
        });
        expect(lineage.getLineageRecords().every(record => (
            record.states.every(state => state.state !== RecordProcessingState.TRANSFORMED)
        ))).toBe(true);
    });

    it('keeps lineage attached to records after filtering shifts array indexes', async () => {
        const adapterRuntime = {
            executeDryRun: vi.fn()
                .mockResolvedValueOnce({
                    metrics: {},
                    sampleRecords: [],
                    outputRecords: [{ sku: 'SKU-2' }],
                    errors: [],
                })
                .mockResolvedValueOnce({
                    metrics: {},
                    sampleRecords: [],
                    outputRecords: [{ sku: 'SKU-2-NORMALIZED' }],
                    errors: [],
                }),
        } as unknown as AdapterRuntimeService;
        const executor = new SandboxStepExecutor(adapterRuntime);
        const lineage = new DataLineageTracker(options);
        lineage.initialize([{ sku: 'SKU-1' }, { sku: 'SKU-2' }]);

        const filtered = await executor.executeStep(
            {} as RequestContext,
            { key: 'filter', type: 'TRANSFORM', config: {} },
            [{ sku: 'SKU-1' }, { sku: 'SKU-2' }],
            options,
            lineage,
        );
        await executor.executeStep(
            {} as RequestContext,
            { key: 'normalize', type: 'TRANSFORM', config: {} },
            filtered.outputRecords ?? [],
            options,
            lineage,
        );

        expect(filtered.samples).toContainEqual(expect.objectContaining({
            recordId: 'SKU-1',
            outcome: RecordOutcome.FILTERED,
        }));
        expect(lineage.getLineageRecords()).toEqual([
            expect.objectContaining({
                originalRecordId: 'SKU-1',
                finalOutcome: LineageOutcome.FILTERED,
            }),
            expect.objectContaining({
                originalRecordId: 'SKU-2',
                finalRecordId: 'SKU-2-NORMALIZED',
                finalOutcome: LineageOutcome.LOADED,
                states: expect.arrayContaining([
                    expect.objectContaining({ stepKey: 'normalize' }),
                ]),
            }),
        ]);
    });
});
