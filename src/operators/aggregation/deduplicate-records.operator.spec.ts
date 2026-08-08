import { describe, expect, it } from 'vitest';
import { deduplicateRecordsOperator } from './deduplicate-records.operator';

const records = [
    { sku: 'A', source: 'first', priority: 2 },
    { sku: 'B', source: 'only', priority: 1 },
    { sku: 'A', source: 'last', priority: 1 },
];

function apply(keep: 'FIRST' | 'LAST' | 'LOWEST' | 'HIGHEST', priority?: string) {
    return deduplicateRecordsOperator(records, { key: 'sku', keep, priority }, {} as never).records;
}

describe('deduplicateRecords operator', () => {
    it('keeps first or last matches without changing first-seen key order', () => {
        expect(apply('FIRST')).toEqual([records[0], records[1]]);
        expect(apply('LAST')).toEqual([records[2], records[1]]);
    });

    it('selects the lowest or highest numeric priority deterministically', () => {
        expect(apply('LOWEST', 'priority')).toEqual([records[2], records[1]]);
        expect(apply('HIGHEST', 'priority')).toEqual([records[0], records[1]]);
    });

    it('keeps invalid keys distinct and uses type-strict scalar keys', () => {
        const result = deduplicateRecordsOperator([
            { sku: null, value: 1 },
            { value: 2 },
            { sku: { nested: true }, value: 3 },
            { sku: 1, value: 4 },
            { sku: '1', value: 5 },
            { sku: 1, value: 6 },
        ], { key: 'sku' }, {} as never).records;

        expect(result).toHaveLength(5);
        expect(result.slice(-2)).toEqual([
            { sku: 1, value: 4 },
            { sku: '1', value: 5 },
        ]);
    });

    it('rejects invalid configuration and priority data', () => {
        expect(() => deduplicateRecordsOperator(records, { key: '', keep: 'FIRST' }, {} as never))
            .toThrow('key is required');
        expect(() => deduplicateRecordsOperator(records, { key: 'sku', keep: 'LOWEST' }, {} as never))
            .toThrow('priority is required');
        expect(() => deduplicateRecordsOperator([
            { sku: 'A', priority: 1 },
            { sku: 'A', priority: '2' },
        ], { key: 'sku', keep: 'HIGHEST', priority: 'priority' }, {} as never))
            .toThrow('priority values must be finite numbers');
    });
});
