import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { PipelineDefinition } from '../../types';
import type { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import type { DataHubLoggerFactory } from '../logger';
import { ImpactAnalysisService } from './impact-analysis.service';

const definition: PipelineDefinition = {
    version: 1,
    steps: [
        { key: 'extract', type: 'EXTRACT', config: { adapterCode: 'seed' } },
        { key: 'transform', type: 'TRANSFORM', config: {} },
        { key: 'load', type: 'LOAD', config: { adapterCode: 'productUpsert' } },
    ],
};

function createFixture(pipelineDefinition: PipelineDefinition = definition) {
    const pipeline = { id: 1, definition: pipelineDefinition };
    const findOne = vi.fn(async () => pipeline);
    const findOneInChannel = vi.fn(
        async (): Promise<typeof pipeline | undefined> => pipeline,
    );
    const connection = {
        findOneInChannel,
        getRepository: vi.fn(() => ({ findOne, find: vi.fn(async () => []) })),
    } as unknown as TransactionalConnection;
    const executeDryRun = vi.fn(async () => ({
        metrics: {
            totalRecords: 10,
            details: [
                { stepKey: 'transform', recordsIn: 10, recordsOut: 4 },
                {
                    stepKey: 'load',
                    recordsIn: 4,
                    recordsOut: 4,
                    recordDetails: [{
                        recordId: 'SKU-1',
                        entityType: 'Product',
                        operation: 'CREATE',
                        currentState: null,
                        proposedState: { sku: 'SKU-1' },
                        validationErrors: [],
                        warnings: [],
                    }],
                },
            ],
        },
        sampleRecords: [{
            step: 'transform',
            before: { sku: 'SKU-1', old: true },
            after: { sku: 'SKU-1', active: true },
        }],
    }));
    const adapterRuntime = { executeDryRun } as unknown as AdapterRuntimeService;
    const loggerFactory = {
        createLogger: vi.fn(() => ({ debug: vi.fn() })),
    } as unknown as DataHubLoggerFactory;
    const registry = { find: vi.fn() };
    const ctx = { channelId: 'channel-a', userHasPermissions: vi.fn(() => true) } as unknown as RequestContext;
    return {
        service: new ImpactAnalysisService(
            connection,
            adapterRuntime,
            registry as never,
            loggerFactory,
        ),
        executeDryRun,
        findOneInChannel,
        ctx,
    };
}

describe('ImpactAnalysisService', () => {
    it('rejects analysis outside the active channel before execution', async () => {
        const { service, executeDryRun, findOneInChannel, ctx } = createFixture();
        findOneInChannel.mockResolvedValueOnce(undefined);

        await expect(service.analyze(ctx, 1)).rejects.toThrow('Pipeline 1 not found');
        expect(findOneInChannel).toHaveBeenCalledWith(
            ctx,
            expect.any(Function),
            1,
            'channel-a',
        );
        expect(executeDryRun).not.toHaveBeenCalled();
    });

    it('uses exact dry-run step counts and forwards the sample limit', async () => {
        const { service, executeDryRun, ctx } = createFixture();

        const result = await service.analyzeStep(
            ctx,
            1,
            'transform',
            { sampleSize: 25, includeFieldChanges: false },
        );

        expect(executeDryRun).toHaveBeenCalledWith(
            expect.anything(),
            definition,
            25,
        );
        expect(result).toMatchObject({
            recordsIn: 10,
            recordsOut: 4,
            fieldChanges: [],
        });
    });

    it('returns simulated record details and preserves requested order', async () => {
        const { service, ctx } = createFixture();

        const result = await service.getRecordDetails(
            ctx,
            1,
            ['missing', 'SKU-1', 'SKU-1'],
        );

        expect(result.map(detail => detail.recordId)).toEqual(['missing', 'SKU-1']);
        expect(result.map(detail => detail.operation)).toEqual(['UNKNOWN', 'CREATE']);
    });

    it('rejects invalid sample sizes before executing the pipeline', async () => {
        const { service, executeDryRun, ctx } = createFixture();

        await expect(service.analyzeStep(
            ctx,
            1,
            'transform',
            { sampleSize: 0 },
        )).rejects.toThrow('sampleSize must be an integer');
        expect(executeDryRun).not.toHaveBeenCalled();
    });

    it('omits resource estimates when the caller disables them', async () => {
        const { service, ctx } = createFixture();

        const result = await service.analyze(
            ctx,
            1,
            { includeResourceEstimate: false },
        );

        expect(result.resourceUsage).toBeNull();
    });

    it('rejects connection-backed analysis without resource-use permissions', async () => {
        const connectionDefinition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'extract',
                type: 'EXTRACT',
                config: { adapterCode: 'httpApi', connectionCode: 'erp' },
            }],
        };
        const { service, executeDryRun, ctx } = createFixture(connectionDefinition);
        vi.mocked(ctx.userHasPermissions).mockReturnValue(false);

        await expect(service.analyze(ctx, 1)).rejects.toThrow(
            'UseDataHubConnection, UseDataHubSecret',
        );
        expect(executeDryRun).not.toHaveBeenCalled();
    });
});
