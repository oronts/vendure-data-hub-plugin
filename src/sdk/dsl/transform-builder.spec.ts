import { describe, expect, it } from 'vitest';
import { OPERATOR_LIMITS } from '../../constants/defaults/runtime-defaults';
import { operators } from './transform-builder';

describe('multiJoin operator builder', () => {
    const baseConfig = {
        leftKey: 'id',
        rightKey: 'productId',
        rightData: [{ productId: 'product-1' }],
    };

    it('preserves valid output limits and defaults the join type', () => {
        expect(operators.multiJoin({
            ...baseConfig,
            maxOutputRecords: OPERATOR_LIMITS.MAX_MULTI_JOIN_OUTPUT_RECORDS,
        })).toEqual({
            op: 'multiJoin',
            args: {
                ...baseConfig,
                type: 'LEFT',
                maxOutputRecords: OPERATOR_LIMITS.MAX_MULTI_JOIN_OUTPUT_RECORDS,
            },
        });
    });

    it.each([0, 1.5, OPERATOR_LIMITS.MAX_MULTI_JOIN_OUTPUT_RECORDS + 1])(
        'rejects invalid output limit %s',
        maxOutputRecords => {
            expect(() => operators.multiJoin({
                ...baseConfig,
                maxOutputRecords,
            })).toThrow();
        },
    );

    it('rejects oversized and structurally invalid right datasets', () => {
        expect(() => operators.multiJoin({
            ...baseConfig,
            rightData: Array.from(
                { length: OPERATOR_LIMITS.MAX_MULTI_JOIN_RIGHT_RECORDS + 1 },
                (_, productId) => ({ productId }),
            ),
        })).toThrow('Right data must contain at most');

        expect(() => operators.multiJoin({
            ...baseConfig,
            rightData: [null] as never,
        })).toThrow('Right data must contain only objects');
    });
});

describe('deduplicateRecords operator builder', () => {
    it('builds deterministic key and priority configuration', () => {
        expect(operators.deduplicateRecords('sku', {
            keep: 'LOWEST',
            priority: '_sourcePriority',
        })).toEqual({
            op: 'deduplicateRecords',
            args: { key: 'sku', keep: 'LOWEST', priority: '_sourcePriority' },
        });
    });

    it('requires a priority path for ordered strategies', () => {
        expect(() => operators.deduplicateRecords('sku', { keep: 'HIGHEST' }))
            .toThrow('Priority is required');
    });
});

describe('operator builder contracts', () => {
    it('snapshots nested mutable inputs', () => {
        const mapping = { title: 'product.name' };
        const value = { nested: { enabled: true } };
        const rightData = [{ id: 'right-1', details: { rank: 1 } }];

        const mapped = operators.map(mapping);
        const set = operators.set('metadata', value);
        const joined = operators.multiJoin({
            leftKey: 'id',
            rightKey: 'id',
            rightData,
        });

        mapping.title = 'changed';
        value.nested.enabled = false;
        rightData[0].details.rank = 2;

        expect(mapped.args?.mapping).toEqual({ title: 'product.name' });
        expect(set.args?.value).toEqual({ nested: { enabled: true } });
        expect(joined.args?.rightData).toEqual([
            { id: 'right-1', details: { rank: 1 } },
        ]);
    });

    it('requires complete UUID v5 inputs and rejects v5-only inputs for v4', () => {
        expect(() => operators.uuid('id', 'v5')).toThrow('Namespace');
        expect(() => operators.uuid('id', 'v5', 'dns')).toThrow('Source');
        expect(() => operators.uuid('id', 'v4', 'dns', 'name'))
            .toThrow('only valid for UUID v5');
        expect(operators.uuid('id', 'v5', 'dns', 'name')).toEqual({
            op: 'uuid',
            args: {
                target: 'id',
                version: 'v5',
                namespace: 'dns',
                source: 'name',
            },
        });
    });

    it('rejects invalid field arrays and unsafe regular expressions', () => {
        expect(() => operators.concat(['valid', ''], 'combined')).toThrow('Sources[1]');
        expect(() => operators.pick(['valid', '   '])).toThrow('Fields[1]');
        expect(() => operators.extractRegex('value', 'result', '(a+)+$'))
            .toThrow('Pattern is unsafe');
        expect(() => operators.validateFormat('value', '(a+)+$'))
            .toThrow('Pattern is unsafe');
    });

    it('uses the runtime flatten and aggregate contracts', () => {
        expect(operators.flatten('items', 'flatItems', 2)).toEqual({
            op: 'flatten',
            args: { source: 'items', target: 'flatItems', depth: 2 },
        });
        expect(operators.aggregate('count', undefined, 'recordCount')).toEqual({
            op: 'aggregate',
            args: { op: 'count', source: undefined, target: 'recordCount' },
        });
        expect(() => operators.aggregate('sum', undefined, 'total')).toThrow('Source');
    });

    it('exposes and validates the complete HTTP lookup limits', () => {
        expect(operators.httpLookup(
            'https://api.example.com/products/{{sku}}',
            'external',
            { batchSize: 25, rateLimitPerSecond: 100 },
        )).toMatchObject({
            op: 'httpLookup',
            args: { batchSize: 25, rateLimitPerSecond: 100 },
        });
        expect(() => operators.httpLookup(
            'https://api.example.com/products/{{sku}}',
            'external',
            { batchSize: 0 },
        )).toThrow('batchSize');
    });

    it('validates bounded numeric and file settings before execution', () => {
        expect(() => operators.currency('price', 'minorUnits', 1.5)).toThrow('Decimals');
        expect(() => operators.dateAdd('createdAt', 'expiresAt', Number.NaN, 'days'))
            .toThrow('Amount');
        expect(() => operators.imageResize({ sourceField: 'image', width: 1.5 }))
            .toThrow('Width');
        expect(() => operators.imageConvert({
            sourceField: 'image',
            format: 'webp',
            quality: 101,
        })).toThrow('Quality');
        expect(() => operators.pdfGenerate({ targetField: 'document' }))
            .toThrow('Template or template field is required');
    });
});
