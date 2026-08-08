import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { StepType, type PipelineDefinition } from '../../../types';
import type {
    ExtractExecutor,
    ExportExecutor,
    FeedExecutor,
    GateExecutor,
    LoadExecutor,
    SinkExecutor,
    TransformExecutor,
} from '../../executors';
import type { DomainEventsService } from '../../../services/events/domain-events.service';
import type { HookService } from '../../../services/events/hook.service';
import { StepDispatcher } from './step-dispatcher';
import type { StepExecutionParams } from './step-dispatcher';
import type { RecordObject } from '../../executor-types';

const DEFINITION: PipelineDefinition = {
    version: 1,
    steps: [],
    edges: [],
};

function createDispatcher(
    execute: ExtractExecutor['execute'],
    validateExtractedRecords: ExtractExecutor['validateExtractedRecords'] = vi.fn(
        async (_ctx, _step, records) => records,
    ),
): StepDispatcher {
    return new StepDispatcher({
        extractExecutor: {
            execute,
            validateExtractedRecords,
        } as unknown as ExtractExecutor,
        transformExecutor: {} as TransformExecutor,
        loadExecutor: {} as LoadExecutor,
        exportExecutor: {} as ExportExecutor,
        feedExecutor: {} as FeedExecutor,
        sinkExecutor: {} as SinkExecutor,
        gateExecutor: {} as GateExecutor,
        loadWithThroughput: vi.fn(),
        applyIdempotency: vi.fn(records => records),
    });
}

function createParams(
    seedMode: 'RECORDS' | 'SOURCE_REFERENCES',
): StepExecutionParams {
    const input = [{ __dataHubRemoteFile: { path: '/incoming/products.csv' } }];
    return {
        ctx: {} as RequestContext,
        definition: DEFINITION,
        step: { key: 'source', type: StepType.EXTRACT, adapterCode: 'ftp', config: {} },
        key: 'source',
        input,
        executorCtx: {
            cpData: {},
            cpDirty: false,
            markCheckpointDirty: vi.fn(),
        },
        hookService: {
            runInterceptors: vi.fn(async (_ctx, _definition, _stage, records) => ({ records })),
        } as unknown as HookService,
        domainEvents: {} as DomainEventsService,
        seedMode,
    };
}

describe('StepDispatcher seeded extraction modes', () => {
    it('keeps payload seeds as extractor output without invoking the source adapter', async () => {
        const execute = vi.fn<ExtractExecutor['execute']>();

        const result = await createDispatcher(execute).executeStep(createParams('RECORDS'));

        expect(execute).not.toHaveBeenCalled();
        expect(result.output).toEqual(createParams('RECORDS').input);
    });

    it('executes the extractor and passes file-watch source references', async () => {
        const extracted = [{ sku: 'SKU-1', name: 'Product' }];
        const execute = vi.fn<ExtractExecutor['execute']>(async () => extracted);
        const params = createParams('SOURCE_REFERENCES');

        const result = await createDispatcher(execute).executeStep(params);

        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0]?.[6]).toEqual(params.input);
        expect(result.output).toEqual(extracted);
    });

    it('validates seeded records after the after-extract hook', async () => {
        const execute = vi.fn<ExtractExecutor['execute']>();
        const validate = vi.fn<ExtractExecutor['validateExtractedRecords']>(
            async (_ctx, _step, records) => records.filter(record => record.valid),
        );
        const params = createParams('RECORDS');
        params.step = {
            ...params.step,
            schemaRef: { schemaId: 'catalog.product', version: '1.0.0' },
        };
        params.hookService = {
            runInterceptors: vi.fn(async (
                _ctx,
                _definition,
                _stage,
                records: RecordObject[],
            ) => ({
                records: records.map(record => ({ ...record, valid: false })),
            })),
        } as unknown as HookService;

        const result = await createDispatcher(execute, validate).executeStep(params);

        expect(execute).not.toHaveBeenCalled();
        expect(validate).toHaveBeenCalledWith(
            params.ctx,
            params.step,
            [expect.objectContaining({ valid: false })],
            undefined,
        );
        expect(result.output).toEqual([]);
        expect(result.failed).toBe(1);
    });
});
