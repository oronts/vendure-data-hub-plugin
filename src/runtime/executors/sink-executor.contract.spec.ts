import { describe, expect, it, vi } from 'vitest';
import { BATCH, FIELD_LIMITS } from '../../constants';
import type { RecordObject } from '../executor-types';
import {
    partitionSinkRecords,
    resolveSinkBatchSize,
    resolveSinkOperation,
} from './sink-execution-contract';
import { resolveSinkIdentityField } from './sink.executor';

describe('sink identity contract', () => {
    it('uses the Meilisearch primary key for upsert and delete identity', () => {
        expect(resolveSinkIdentityField('meilisearch', {
            primaryKey: 'productNumber',
            idField: 'legacyId',
        })).toBe('productNumber');
    });

    it('uses idField for other sinks', () => {
        expect(resolveSinkIdentityField('elasticsearch', {
            primaryKey: 'ignored',
            idField: 'sku',
        })).toBe('sku');
    });
});

describe('sink execution contract', () => {
    it.each([
        [undefined, BATCH.BULK_SIZE],
        [FIELD_LIMITS.BATCH_SIZE_MIN, FIELD_LIMITS.BATCH_SIZE_MIN],
        [FIELD_LIMITS.BATCH_SIZE_MAX, FIELD_LIMITS.BATCH_SIZE_MAX],
    ])('accepts batch size %s', (value, expected) => {
        expect(resolveSinkBatchSize(value)).toBe(expected);
    });

    it.each([
        null,
        '100',
        0,
        1.5,
        FIELD_LIMITS.BATCH_SIZE_MAX + 1,
        Number.POSITIVE_INFINITY,
        Number.NaN,
    ])('rejects unsafe batch size %s', value => {
        expect(() => resolveSinkBatchSize(value)).toThrow(
            `Sink batchSize must be an integer from ${FIELD_LIMITS.BATCH_SIZE_MIN} to ${FIELD_LIMITS.BATCH_SIZE_MAX}`,
        );
    });

    it('normalizes supported operation values', () => {
        expect(resolveSinkOperation(' upsert ', 'operation')).toBe('UPSERT');
        expect(resolveSinkOperation('delete', 'operation')).toBe('DELETE');
    });

    it('partitions valid records and reports invalid record operations', async () => {
        const records: RecordObject[] = [
            { id: 'default' },
            { id: 'upsert', __operation: ' upsert ' },
            { id: 'delete', __operation: 'delete' },
            { id: 'unknown', __operation: 'replace' },
            { id: 'null', __operation: null },
        ];
        const onRecordError = vi.fn(async () => undefined);

        const result = await partitionSinkRecords(records, 'DELETE', 'sink-step', onRecordError);

        expect(result).toEqual({
            upsertRecords: [{ id: 'upsert' }],
            deleteRecords: [{ id: 'default' }, { id: 'delete' }],
            invalid: 2,
        });
        expect(onRecordError).toHaveBeenNthCalledWith(
            1,
            'sink-step',
            'Record __operation must be UPSERT or DELETE',
            records[3],
        );
        expect(onRecordError).toHaveBeenNthCalledWith(
            2,
            'sink-step',
            'Record __operation must be UPSERT or DELETE',
            records[4],
        );
    });

    it('rejects an invalid configured default before partitioning records', async () => {
        const onRecordError = vi.fn(async () => undefined);

        await expect(partitionSinkRecords(
            [{ id: 'record' }],
            'replace',
            'sink-step',
            onRecordError,
        )).rejects.toThrow('Sink defaultOperation must be UPSERT or DELETE');
        expect(onRecordError).not.toHaveBeenCalled();
    });
});
