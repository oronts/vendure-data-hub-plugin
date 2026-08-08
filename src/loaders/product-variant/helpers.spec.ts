import { describe, expect, it, vi } from 'vitest';
import type {
    ProductOptionGroupService,
    RequestContext,
    TaxCategoryService,
} from '@vendure/core';
import {
    createVariantExternalIdLookupStrategy,
    resolveOptionIds,
    resolveVariantTaxCategoryId,
} from './helpers';

function createService(categories: Array<{
    id: string;
    name: string;
    isDefault: boolean;
    customFields: Record<string, unknown>;
}>): TaxCategoryService {
    return {
        findOne: vi.fn(async (_ctx, id) => categories.find(category => category.id === id)),
        findAll: vi.fn(async () => ({ items: categories, totalItems: categories.length })),
    } as unknown as TaxCategoryService;
}

const categories = [
    { id: 'first', name: 'Standard', isDefault: false, customFields: { code: 'standard' } },
    { id: 'default', name: 'Default category', isDefault: true, customFields: { code: 'default-tax' } },
];

describe('product variant tax category resolution', () => {
    const ctx = {} as RequestContext;

    it('resolves an explicit ID without relying on list ordering', async () => {
        const service = createService(categories);

        await expect(resolveVariantTaxCategoryId(ctx, service, {
            taxCategoryId: 'default',
        })).resolves.toBe('default');
        expect(service.findAll).not.toHaveBeenCalled();
    });

    it('resolves code from customFields.code rather than the display name', async () => {
        const service = createService(categories);

        await expect(resolveVariantTaxCategoryId(ctx, service, {
            taxCategoryCode: 'standard',
        })).resolves.toBe('first');
        await expect(resolveVariantTaxCategoryId(ctx, service, {
            taxCategoryCode: 'Standard',
        })).rejects.toThrow('code "Standard" was not found');
    });

    it('delegates an omitted category to Vendure create behavior', async () => {
        const service = createService(categories);

        await expect(resolveVariantTaxCategoryId(ctx, service, {})).resolves.toBeUndefined();
        expect(service.findOne).not.toHaveBeenCalled();
        expect(service.findAll).not.toHaveBeenCalled();
    });

    it('fails closed for unknown explicit IDs and codes', async () => {
        const service = createService(categories);

        await expect(resolveVariantTaxCategoryId(ctx, service, {
            taxCategoryId: 'missing',
        })).rejects.toThrow('ID "missing" was not found');
        await expect(resolveVariantTaxCategoryId(ctx, service, {
            taxCategoryCode: 'missing',
        })).rejects.toThrow('code "missing" was not found');
    });
});

describe('product variant option resolution', () => {
    const ctx = {} as RequestContext;

    it('resolves exact option codes within the parent product', async () => {
        const getOptionGroupsByProductId = vi.fn(async (
            _ctx: RequestContext,
            productId: string,
        ) => productId === 'product-1'
            ? [{
                id: 'group-1',
                options: [{ id: 'option-1', code: 'size-small', name: 'Small' }],
            }]
            : []);
        const service = {
            getOptionGroupsByProductId,
        } as unknown as ProductOptionGroupService;

        await expect(
            resolveOptionIds(ctx, service, 'product-1', ['size-small']),
        ).resolves.toEqual(['option-1']);
        await expect(
            resolveOptionIds(ctx, service, 'product-1', ['Small']),
        ).rejects.toThrow(
            'Option codes not found: Small',
        );
        expect(getOptionGroupsByProductId).toHaveBeenLastCalledWith(ctx, 'product-1');
    });

    it('rejects option codes that are ambiguous within the parent product', async () => {
        const service = {
            getOptionGroupsByProductId: vi.fn(async () => [
                { id: 'group-1', options: [{ id: 'option-1', code: 'shared' }] },
                { id: 'group-2', options: [{ id: 'option-2', code: 'shared' }] },
            ]),
        } as unknown as ProductOptionGroupService;

        await expect(
            resolveOptionIds(ctx, service, 'product-1', ['shared']),
        ).rejects.toThrow('Option codes are ambiguous for product product-1: shared');
    });

    it('preserves service failures rather than misreporting them as missing codes', async () => {
        const service = {
            getOptionGroupsByProductId: vi.fn(async () => {
                throw new Error('database unavailable');
            }),
        } as unknown as ProductOptionGroupService;

        await expect(
            resolveOptionIds(ctx, service, 'product-1', ['size-small']),
        ).rejects.toThrow('database unavailable');
    });
});

describe('product variant external ID lookup', () => {
    it('scopes the custom-field query to the active Vendure channel', async () => {
        const getOne = vi.fn(async () => ({ id: 'variant-1' }));
        const where = vi.fn(() => ({ getOne }));
        const innerJoin = vi.fn(() => ({ where }));
        const createQueryBuilder = vi.fn(() => ({
            escape: (value: string) => `"${value}"`,
            innerJoin,
        }));
        const connection = {
            getRepository: vi.fn(() => ({
                metadata: {
                    findColumnWithPropertyPath: vi.fn(() => ({
                        databaseName: 'customFieldsExternalId',
                    })),
                },
                createQueryBuilder,
            })),
        };
        const strategy = createVariantExternalIdLookupStrategy(connection as never);
        const ctx = { channelId: 'channel-1' } as RequestContext;

        await expect(strategy.lookup(ctx, connection as never, 'erp-1')).resolves.toEqual({
            id: 'variant-1',
            entity: { id: 'variant-1' },
        });
        expect(innerJoin).toHaveBeenCalledWith(
            'lookupVariant.channels',
            'lookupChannel',
            'lookupChannel.id = :channelId',
            { channelId: 'channel-1' },
        );
        expect(where).toHaveBeenCalledWith(
            '"lookupVariant"."customFieldsExternalId" = :externalId',
            { externalId: 'erp-1' },
        );
    });
});
