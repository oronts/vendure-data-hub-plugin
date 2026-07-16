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

const DEFINITION: PipelineDefinition = {
    version: 1,
    steps: [],
    edges: [],
};

function createDispatcher(execute: ExtractExecutor['execute']): StepDispatcher {
    return new StepDispatcher({
        extractExecutor: { execute } as unknown as ExtractExecutor,
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

function createParams(seedMode: 'RECORDS' | 'SOURCE_REFERENCES') {
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
        const execute = vi.fn<
            Parameters<ExtractExecutor['execute']>,
            ReturnType<ExtractExecutor['execute']>
        >();

        const result = await createDispatcher(execute).executeStep(createParams('RECORDS'));

        expect(execute).not.toHaveBeenCalled();
        expect(result.output).toEqual(createParams('RECORDS').input);
    });

    it('executes the extractor and passes file-watch source references', async () => {
        const extracted = [{ sku: 'SKU-1', name: 'Product' }];
        const execute = vi.fn<
            Parameters<ExtractExecutor['execute']>,
            ReturnType<ExtractExecutor['execute']>
        >(async () => extracted);
        const params = createParams('SOURCE_REFERENCES');

        const result = await createDispatcher(execute).executeStep(params);

        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0]?.[6]).toEqual(params.input);
        expect(result.output).toEqual(extracted);
    });
});
