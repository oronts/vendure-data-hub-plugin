import { describe, expect, it } from 'vitest';
import { OPERATOR_LIMITS } from '../../constants/defaults/runtime-defaults';
import { multiJoinOperator } from './join.operator';

const helpers = {} as never;

describe('multiJoinOperator', () => {
    it('joins input records with the configured reference dataset', () => {
        const result = multiJoinOperator(
            [{ id: 'product-1', name: 'Shirt' }, { id: 'product-2', name: 'Hat' }],
            {
                leftKey: 'id',
                rightKey: 'productId',
                rightData: [{ productId: 'product-1', price: 1999 }],
                type: 'LEFT',
                prefix: 'reference_',
            },
            helpers,
        );

        expect(result.records).toEqual([
            {
                id: 'product-1',
                name: 'Shirt',
                reference_productId: 'product-1',
                reference_price: 1999,
            },
            {
                id: 'product-2',
                name: 'Hat',
                reference_productId: null,
                reference_price: null,
            },
        ]);
    });

    it('does not match null or missing keys', () => {
        const result = multiJoinOperator(
            [
                { id: null, source: 'left-null' },
                { source: 'left-missing' },
            ],
            {
                leftKey: 'id',
                rightKey: 'productId',
                rightData: [
                    { productId: null, source: 'right-null' },
                    { source: 'right-missing' },
                ],
                type: 'INNER',
            },
            helpers,
        );

        expect(result.records).toEqual([]);
    });

    it('preserves null and missing keys as separate unmatched outer-join records', () => {
        const result = multiJoinOperator(
            [
                { id: null, source: 'left-null' },
                { source: 'left-missing' },
            ],
            {
                leftKey: 'id',
                rightKey: 'productId',
                rightData: [
                    { productId: null, source: 'right-null' },
                    { source: 'right-missing' },
                ],
                type: 'FULL',
                prefix: 'right',
            },
            helpers,
        );

        expect(result.records).toEqual([
            {
                id: null,
                source: 'left-null',
                right_productId: null,
                right_source: null,
            },
            {
                source: 'left-missing',
                right_productId: null,
                right_source: null,
            },
            {
                id: null,
                source: null,
                right_productId: null,
                right_source: 'right-null',
            },
            {
                id: null,
                source: null,
                right_productId: null,
                right_source: 'right-missing',
            },
        ]);
    });

    it('matches only scalar keys of the same type', () => {
        const result = multiJoinOperator(
            [
                { id: 1, source: 'left-number' },
                { id: '1', source: 'left-string' },
                { id: true, source: 'left-boolean' },
                { id: { nested: 1 }, source: 'left-object' },
            ],
            {
                leftKey: 'id',
                rightKey: 'productId',
                rightData: [
                    { productId: '1', match: 'string' },
                    { productId: 1, match: 'number' },
                    { productId: true, match: 'boolean' },
                    { productId: { nested: 1 }, match: 'object' },
                ],
                type: 'INNER',
                select: ['match'],
            },
            helpers,
        );

        expect(result.records).toEqual([
            { id: 1, source: 'left-number', match: 'number' },
            { id: '1', source: 'left-string', match: 'string' },
            { id: true, source: 'left-boolean', match: 'boolean' },
        ]);
    });

    it('preserves one-to-many output for valid duplicate keys', () => {
        const result = multiJoinOperator(
            [{ id: 'shared', left: 1 }, { id: 'shared', left: 2 }],
            {
                leftKey: 'id',
                rightKey: 'id',
                rightData: [{ id: 'shared', right: 'a' }, { id: 'shared', right: 'b' }],
                type: 'INNER',
                prefix: 'joined',
            },
            helpers,
        );

        expect(result.records).toHaveLength(4);
        expect(result.records).toEqual([
            { id: 'shared', left: 1, joined_id: 'shared', joined_right: 'a' },
            { id: 'shared', left: 1, joined_id: 'shared', joined_right: 'b' },
            { id: 'shared', left: 2, joined_id: 'shared', joined_right: 'a' },
            { id: 'shared', left: 2, joined_id: 'shared', joined_right: 'b' },
        ]);
    });

    it('fails before a one-to-many join exceeds its output ceiling', () => {
        expect(() => multiJoinOperator(
            [{ id: 'shared', left: 1 }, { id: 'shared', left: 2 }],
            {
                leftKey: 'id',
                rightKey: 'id',
                rightData: [{ id: 'shared', right: 'a' }, { id: 'shared', right: 'b' }],
                type: 'INNER',
                maxOutputRecords: 3,
            },
            helpers,
        )).toThrow('multiJoin output exceeds maxOutputRecords (3)');
    });

    it.each([0, 1.5, OPERATOR_LIMITS.MAX_MULTI_JOIN_OUTPUT_RECORDS + 1])(
        'rejects invalid output ceiling %s',
        maxOutputRecords => {
            expect(() => multiJoinOperator(
                [{ id: 'left' }],
                {
                    leftKey: 'id',
                    rightKey: 'id',
                    rightData: [],
                    maxOutputRecords,
                },
                helpers,
            )).toThrow('multiJoin maxOutputRecords must be an integer between');
        },
    );

    it('applies the output ceiling when the right dataset is empty', () => {
        expect(() => multiJoinOperator(
            [{ id: 'one' }, { id: 'two' }],
            {
                leftKey: 'id',
                rightKey: 'id',
                rightData: [],
                maxOutputRecords: 1,
            },
            helpers,
        )).toThrow('multiJoin output exceeds maxOutputRecords (1)');
    });

    it('rejects oversized or structurally invalid right datasets', () => {
        const baseConfig = {
            leftKey: 'id',
            rightKey: 'id',
            type: 'INNER' as const,
        };

        expect(() => multiJoinOperator(
            [],
            {
                ...baseConfig,
                rightData: Array.from(
                    { length: OPERATOR_LIMITS.MAX_MULTI_JOIN_RIGHT_RECORDS + 1 },
                    (_, id) => ({ id }),
                ),
            },
            helpers,
        )).toThrow('multiJoin rightData exceeds the maximum');

        expect(() => multiJoinOperator(
            [],
            { ...baseConfig, rightData: [null] as never },
            helpers,
        )).toThrow('multiJoin rightData[0] must be an object');

        expect(() => multiJoinOperator(
            [],
            { ...baseConfig, rightData: undefined as never },
            helpers,
        )).toThrow('multiJoin rightData must be an array');
    });

    it('rejects missing keys, unknown join types, and invalid selections', () => {
        const config = {
            leftKey: 'id',
            rightKey: 'id',
            rightData: [{ id: 'right' }],
        };

        expect(() => multiJoinOperator(
            [{ id: 'left' }],
            { ...config, leftKey: ' ' },
            helpers,
        )).toThrow('multiJoin leftKey must be a non-empty string');
        expect(() => multiJoinOperator(
            [{ id: 'left' }],
            { ...config, rightKey: undefined as never },
            helpers,
        )).toThrow('multiJoin rightKey must be a non-empty string');
        expect(() => multiJoinOperator(
            [{ id: 'left' }],
            { ...config, type: 'SIDEWAYS' as never },
            helpers,
        )).toThrow('multiJoin type must be INNER, LEFT, RIGHT, or FULL');
        expect(() => multiJoinOperator(
            [{ id: 'left' }],
            { ...config, select: ['id', 1] as never },
            helpers,
        )).toThrow('multiJoin select must be an array of field names');
    });

    it('keeps unmatched right records in source order with a stable union shape', () => {
        const result = multiJoinOperator(
            [{ id: 'left', leftOnly: true }],
            {
                leftKey: 'id',
                rightKey: 'key',
                rightData: [
                    { key: 'a', first: 1 },
                    { missingKey: true },
                    { key: 'b', second: 2 },
                    { key: null, third: 3 },
                ],
                type: 'RIGHT',
                prefix: 'right',
            },
            helpers,
        );

        expect(result.records.map(record => ({
            key: record.right_key,
            first: record.right_first,
            missingKey: record.right_missingKey,
            second: record.right_second,
            third: record.right_third,
        }))).toEqual([
            { key: 'a', first: 1, missingKey: null, second: null, third: null },
            { key: null, first: null, missingKey: true, second: null, third: null },
            { key: 'b', first: null, missingKey: null, second: 2, third: null },
            { key: null, first: null, missingKey: null, second: null, third: 3 },
        ]);
        expect(result.records.every(record => (
            record.id === null && record.leftOnly === null
        ))).toBe(true);
    });

    it('treats empty strings as keys but rejects arrays and non-finite numbers', () => {
        const result = multiJoinOperator(
            [
                { key: '', source: 'empty' },
                { key: [], source: 'array' },
                { key: Number.NaN, source: 'nan' },
                { key: Number.POSITIVE_INFINITY, source: 'infinity' },
            ],
            {
                leftKey: 'key',
                rightKey: 'key',
                rightData: [
                    { key: '', match: 'empty' },
                    { key: [], match: 'array' },
                    { key: Number.NaN, match: 'nan' },
                    { key: Number.POSITIVE_INFINITY, match: 'infinity' },
                ],
                type: 'INNER',
                select: ['match'],
            },
            helpers,
        );

        expect(result.records).toEqual([{ key: '', source: 'empty', match: 'empty' }]);
    });

    it('enforces the default and explicit ceilings for unmatched right records', () => {
        const rightData = Array.from(
            { length: OPERATOR_LIMITS.DEFAULT_MULTI_JOIN_OUTPUT_RECORDS },
            (_, id) => ({ id }),
        );
        const exactBoundary = multiJoinOperator(
            [],
            { leftKey: 'id', rightKey: 'id', rightData, type: 'RIGHT' },
            helpers,
        );

        expect(exactBoundary.records).toHaveLength(
            OPERATOR_LIMITS.DEFAULT_MULTI_JOIN_OUTPUT_RECORDS,
        );
        expect(() => multiJoinOperator(
            [],
            {
                leftKey: 'id',
                rightKey: 'id',
                rightData: [{ id: 1 }, { id: 2 }, { id: 3 }],
                type: 'RIGHT',
                maxOutputRecords: 2,
            },
            helpers,
        )).toThrow('multiJoin output exceeds maxOutputRecords (2)');
    });

    it('treats an empty selection as all right-side fields', () => {
        const result = multiJoinOperator(
            [{ id: 'one' }],
            {
                leftKey: 'id',
                rightKey: 'id',
                rightData: [{ id: 'one', value: 1 }],
                select: [],
                prefix: 'right',
            },
            helpers,
        );

        expect(result.records).toEqual([
            { id: 'one', right_id: 'one', right_value: 1 },
        ]);
    });
});
