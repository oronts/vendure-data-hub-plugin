import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { PipelineDefinition } from '../../types';
import type { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import type { DefinitionValidationService } from '../validation/definition-validation.service';
import type { PipelineExecutionPermissionService } from '../pipeline/pipeline-execution-permission.service';
import type { DataHubLoggerFactory } from '../logger';
import { SandboxService } from './sandbox.service';

function createService(outputs: Record<string, unknown>[][]): SandboxService {
    const executeDryRun = vi.fn();
    outputs.forEach(output => executeDryRun.mockResolvedValueOnce({
        metrics: {},
        sampleRecords: [],
        outputRecords: output,
        errors: [],
    }));

    return new SandboxService(
        {} as TransactionalConnection,
        { executeDryRun } as unknown as AdapterRuntimeService,
        { validate: vi.fn() } as unknown as DefinitionValidationService,
        { assertAllowed: vi.fn(async () => undefined) } as unknown as PipelineExecutionPermissionService,
        {
            createLogger: vi.fn(() => ({
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            })),
        } as unknown as DataHubLoggerFactory,
    );
}

const definition: PipelineDefinition = {
    version: 1,
    steps: [
        { key: 'extract', type: 'EXTRACT', config: { adapterCode: 'seed' } },
        { key: 'transform', type: 'TRANSFORM', config: { adapterCode: 'map' } },
    ],
};

describe('SandboxService record metrics', () => {
    it('counts record volume once instead of once per executed step', async () => {
        const records = [{ sku: 'SKU-1' }, { sku: 'SKU-2' }];
        const service = createService([records, records]);

        const result = await service.executeWithDefinition(
            {} as RequestContext,
            definition,
            { includeLineage: false },
        );

        expect(result.metrics).toEqual({
            totalRecordsProcessed: 2,
            totalRecordsSucceeded: 2,
            totalRecordsFailed: 0,
            totalRecordsFiltered: 0,
        });
    });

    it('preserves filtered outcomes without inflating processed records', async () => {
        const service = createService([
            [{ sku: 'SKU-1' }, { sku: 'SKU-2' }],
            [{ sku: 'SKU-2' }],
        ]);

        const result = await service.executeWithDefinition(
            {} as RequestContext,
            definition,
            { includeLineage: false },
        );

        expect(result.metrics).toEqual({
            totalRecordsProcessed: 2,
            totalRecordsSucceeded: 1,
            totalRecordsFailed: 0,
            totalRecordsFiltered: 1,
        });
    });

    it('tracks seed lineage when execution starts from a later step', async () => {
        const service = createService([[{ sku: 'SKU-1-NORMALIZED' }]]);

        const result = await service.executeWithDefinition(
            {} as RequestContext,
            definition,
            {
                includeLineage: true,
                seedData: [{ sku: 'SKU-1' }],
                startFromStep: 'transform',
            },
        );

        expect(result.dataLineage).toEqual([
            expect.objectContaining({
                originalRecordId: 'SKU-1',
                finalRecordId: 'SKU-1-NORMALIZED',
                states: expect.arrayContaining([
                    expect.objectContaining({ stepKey: 'transform' }),
                ]),
            }),
        ]);
    });
});
