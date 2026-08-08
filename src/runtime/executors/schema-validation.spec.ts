import { describe, expect, it, vi } from 'vitest';
import type { DataHubLoggerFactory } from '../../services/logger';
import type { JsonObject } from '../../types';
import { ExtractExecutor } from './extract.executor';
import { TransformExecutor } from './transform.executor';

function createExecutor(compatibility: 'STRICT' | 'BACKWARD' | 'PERMISSIVE') {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const schemaRegistry = {
        validateRecords: vi.fn(async (_ctx, _reference, records) => ({
            schema: {
                schemaId: 'catalog.product',
                version: '1.0.0',
                compatibility,
            },
            records: records.map((record: Record<string, unknown>) => ({
                record,
                issues: record.sku
                    ? []
                    : [{ path: '$.sku', message: 'is required' }],
            })),
        })),
    };
    const executor = new TransformExecutor(
        { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
        undefined,
        undefined,
        undefined,
        undefined,
        schemaRegistry as never,
    );
    return { executor, logger, schemaRegistry };
}

const STEP = {
    key: 'validate-products',
    type: 'VALIDATE' as const,
    config: {},
    schemaRef: { schemaId: 'catalog.product', version: '1.0.0' },
};

describe('registry-backed validate execution', () => {
    it('fails the whole batch on the first mismatch in FAIL_FAST mode', async () => {
        const { executor } = createExecutor('BACKWARD');
        const onRecordError = vi.fn(async () => undefined);
        const records: JsonObject[] = [{ sku: 'SKU-1' }, {}, { sku: 'SKU-2' }];

        await expect(executor.executeValidate(
            {} as never,
            STEP,
            records,
            onRecordError,
        )).resolves.toEqual([]);
        expect(onRecordError).toHaveBeenCalledOnce();
        expect(onRecordError).toHaveBeenCalledWith(
            STEP.key,
            'Schema catalog.product@1.0.0: $.sku is required',
            records[1],
        );
    });

    it('accepts mismatches with an observable warning in permissive mode', async () => {
        const { executor, logger } = createExecutor('PERMISSIVE');
        const records: JsonObject[] = [{ sku: 'SKU-1' }, {}];

        await expect(executor.executeValidate(
            {} as never,
            STEP,
            records,
        )).resolves.toEqual(records);
        expect(logger.warn).toHaveBeenCalledWith(
            'Permissive schema validation accepted mismatched records',
            expect.objectContaining({ recordCount: 1 }),
        );
    });
});

describe('registry-backed extract execution', () => {
    it('filters mismatches and reports each rejected record', async () => {
        const { logger, schemaRegistry } = createExecutor('BACKWARD');
        const executor = new ExtractExecutor(
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
            undefined,
            undefined,
            schemaRegistry as never,
        );
        const onRecordError = vi.fn(async () => undefined);
        const records: JsonObject[] = [{ sku: 'SKU-1' }, {}, { sku: 'SKU-2' }];

        await expect(executor.validateExtractedRecords(
            {} as never,
            { ...STEP, key: 'extract-products', type: 'EXTRACT' },
            records,
            onRecordError,
        )).resolves.toEqual([records[0], records[2]]);
        expect(onRecordError).toHaveBeenCalledOnce();
        expect(onRecordError).toHaveBeenCalledWith(
            'extract-products',
            'Schema catalog.product@1.0.0: $.sku is required',
            records[1],
        );
    });
});
