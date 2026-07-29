import { describe, expect, it } from 'vitest';
import type { Promotion, RequestContext } from '@vendure/core';
import {
    buildUpdatePromotionInput,
    getPromotionConfig,
    mergeOperations,
} from './promotion-handler-input';

const existing = {
    id: 1,
    couponCode: 'SAVE10',
    enabled: false,
    name: 'Existing',
    description: 'Existing description',
    startsAt: null,
    endsAt: null,
    conditions: [],
    actions: [{ code: 'discount', args: [{ name: 'amount', value: '10' }] }],
} as unknown as Promotion;

describe('promotion handler input', () => {
    it('keeps omitted partial-update fields out of the Vendure input', () => {
        const input = buildUpdatePromotionInput(
            { languageCode: 'en' } as RequestContext,
            { code: 'SAVE10' },
            getPromotionConfig({ adapterCode: 'promotionUpsert' }),
            existing,
        );

        expect(input).toEqual({ id: 1, couponCode: 'SAVE10' });
    });

    it('merges operations idempotently while retaining distinct arguments', () => {
        const merged = mergeOperations(existing.actions, [
            { code: 'discount', arguments: [{ name: 'amount', value: '10' }] },
            { code: 'discount', arguments: [{ name: 'amount', value: '20' }] },
        ]);

        expect(merged).toEqual([
            { code: 'discount', arguments: [{ name: 'amount', value: '10' }] },
            { code: 'discount', arguments: [{ name: 'amount', value: '20' }] },
        ]);
    });

    it('rejects invalid dates and usage limits before calling Vendure', () => {
        const ctx = { languageCode: 'en' } as RequestContext;
        expect(() => buildUpdatePromotionInput(
            ctx,
            { code: 'SAVE10', startsAt: 'not-a-date' },
            getPromotionConfig({ adapterCode: 'promotionUpsert' }),
            existing,
        )).toThrow('Promotion date field "startsAt" is invalid');
        expect(() => buildUpdatePromotionInput(
            ctx,
            { code: 'SAVE10', usage: -1 },
            getPromotionConfig({
                adapterCode: 'promotionUpsert',
                perCustomerUsageLimitField: 'usage',
            }),
            existing,
        )).toThrow('must be a non-negative integer');
    });

    it('rejects unknown update modes instead of silently replacing operations', () => {
        expect(() => getPromotionConfig({
            adapterCode: 'promotionUpsert',
            conditionsMode: 'replace',
        })).toThrow('Unsupported promotion conditions mode "replace"');
    });

    it('rejects unsupported strategies and non-boolean duplicate flags', () => {
        expect(() => getPromotionConfig({
            adapterCode: 'promotionUpsert',
            strategy: 'create',
        })).toThrow('Unsupported load strategy "create"');
        expect(() => getPromotionConfig({
            adapterCode: 'promotionUpsert',
            skipDuplicates: 'true',
        })).toThrow('skipDuplicates must be a boolean');
    });
});
