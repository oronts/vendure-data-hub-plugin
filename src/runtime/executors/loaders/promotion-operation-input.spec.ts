import { describe, expect, it } from 'vitest';
import {
    parsePromotionOperations,
    requirePromotionActions,
} from './promotion-operation-input';

describe('promotion operation input', () => {
    it('distinguishes an omitted field from an explicit empty array', () => {
        expect(parsePromotionOperations({}, 'actions', 'actions')).toEqual({ present: false });
        expect(parsePromotionOperations({ actions: [] }, 'actions', 'actions')).toEqual({
            present: true,
            operations: [],
        });
    });

    it('accepts typed arrays and JSON arrays', () => {
        const operation = {
            code: 'order_percentage_discount',
            arguments: [{ name: 'discount', value: '10' }],
        };
        expect(parsePromotionOperations({ actions: [operation] }, 'actions', 'actions').operations)
            .toEqual([operation]);
        expect(parsePromotionOperations(
            { actions: JSON.stringify([operation]) },
            'actions',
            'actions',
        ).operations).toEqual([operation]);
    });

    it('rejects malformed and partial operations', () => {
        expect(() => parsePromotionOperations({ actions: '{' }, 'actions', 'actions'))
            .toThrow('must contain valid JSON');
        expect(() => parsePromotionOperations(
            { actions: [{ code: '', arguments: [] }] },
            'actions',
            'actions',
        )).toThrow('must be an array of operations');
    });

    it('requires a real action when creating a promotion', () => {
        expect(() => requirePromotionActions({ present: false }))
            .toThrow('requires at least one action');
        expect(() => requirePromotionActions({ present: true, operations: [] }))
            .toThrow('requires at least one action');
    });
});
