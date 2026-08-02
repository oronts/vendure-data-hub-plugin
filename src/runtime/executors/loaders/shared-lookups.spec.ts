import { describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@vendure/core';
import {
    createOptionGroupCache,
    getTranslationString,
    parseTranslationsInput,
    resolveChannelIds,
    resolveOptionCodes,
    resolveOptionGroups,
    resolveStockLevels,
    resolveTaxCategoryId,
} from './shared-lookups';

const context = {} as RequestContext;

function createOptionGroupService(
    groupsByProduct: Record<string, Array<{
        id: string;
        code: string;
        options: Array<{ id: string; code: string }>;
    }>>,
) {
    return {
        getOptionGroupsByProductId: vi.fn().mockImplementation(
            async (_ctx: RequestContext, productId: string) =>
                groupsByProduct[productId] ?? [],
        ),
    };
}

describe('product-scoped option lookups', () => {
    it('keeps identical option codes isolated by parent product', async () => {
        const service = createOptionGroupService({
            'product-1': [{
                id: 'group-1',
                code: 'color',
                options: [{ id: 'option-1-blue', code: 'blue' }],
            }],
            'product-2': [{
                id: 'group-2',
                code: 'color',
                options: [{ id: 'option-2-blue', code: 'blue' }],
            }],
        });
        const cache = createOptionGroupCache();

        await expect(resolveOptionCodes(
            service as never,
            context,
            'product-1',
            ['blue'],
            cache,
        )).resolves.toEqual(['option-1-blue']);
        await expect(resolveOptionCodes(
            service as never,
            context,
            'product-2',
            ['blue'],
            cache,
        )).resolves.toEqual(['option-2-blue']);
        expect(service.getOptionGroupsByProductId).toHaveBeenCalledTimes(2);
    });

    it('rejects ambiguous codes within the parent product', async () => {
        const service = createOptionGroupService({
            'product-1': [
                {
                    id: 'group-1',
                    code: 'primary-color',
                    options: [{ id: 'option-1-blue', code: 'blue' }],
                },
                {
                    id: 'group-2',
                    code: 'accent-color',
                    options: [{ id: 'option-2-blue', code: 'blue' }],
                },
            ],
        });

        await expect(resolveOptionCodes(
            service as never,
            context,
            'product-1',
            ['blue'],
            createOptionGroupCache(),
        )).rejects.toThrow('Option code "blue" is ambiguous for product product-1');
    });

    it('rejects codes absent from the parent product', async () => {
        const service = createOptionGroupService({ 'product-1': [] });

        await expect(resolveOptionCodes(
            service as never,
            context,
            'product-1',
            ['missing'],
            createOptionGroupCache(),
        )).rejects.toThrow('Option code "missing" was not found for product product-1');
    });

    it('propagates option-group creation failures', async () => {
        const groupService = {
            getOptionGroupsByProductId: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockRejectedValue(new Error('group create failed')),
        };

        await expect(resolveOptionGroups(
            groupService as never,
            {} as never,
            {} as never,
            context,
            'product-1',
            { color: 'Blue' },
            createOptionGroupCache(),
        )).rejects.toThrow('group create failed');
    });
});

describe('reference lookup validation', () => {
    const logger = { warn: vi.fn() };

    it('rejects missing configured tax categories', async () => {
        const service = {
            findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        };

        await expect(resolveTaxCategoryId(
            service as never,
            context,
            'Standard Tax',
            logger,
        )).rejects.toThrow('Tax category not found: Standard Tax');
    });

    it('rejects missing stock locations instead of dropping quantities', async () => {
        const service = {
            findAll: vi.fn().mockResolvedValue({
                items: [{ id: 'location-1', name: 'Main' }],
                totalItems: 1,
            }),
        };

        await expect(resolveStockLevels(
            service as never,
            context,
            { Main: 4, Overflow: 2 },
            logger,
        )).rejects.toThrow('Stock location not found: Overflow');
    });

    it('rejects non-string entries in channel arrays', async () => {
        await expect(resolveChannelIds(
            {} as never,
            context,
            ['retail', { code: 'b2b' }],
            new Map(),
            logger,
        )).rejects.toThrow('Channel code at index 1 must be a non-empty string');
    });
});

describe('translation input validation', () => {
    it('normalizes array and language-map input', () => {
        expect(parseTranslationsInput([
            { languageCode: 'en', name: 'Name' },
        ])).toEqual([{ languageCode: 'en', name: 'Name' }]);
        expect(parseTranslationsInput({
            de: { name: 'Name' },
        })).toEqual([{ languageCode: 'de', name: 'Name' }]);
    });

    it('rejects malformed entries, language codes, and duplicates', () => {
        expect(() => parseTranslationsInput([null])).toThrow(
            'Translation at index 0 must be an object',
        );
        expect(() => parseTranslationsInput([
            { languageCode: 'not-a-language', name: 'Name' },
        ])).toThrow('Unsupported translation language code "not-a-language"');
        expect(() => parseTranslationsInput([
            { languageCode: 'en', name: 'First' },
            { languageCode: 'en', name: 'Second' },
        ])).toThrow('Duplicate translation language "en"');
    });

    it('rejects non-string translation text instead of coercing it', () => {
        expect(() => getTranslationString(
            { name: { nested: true } },
            'name',
            'Fallback',
        )).toThrow('Translation field "name" must be a string');
    });
});
