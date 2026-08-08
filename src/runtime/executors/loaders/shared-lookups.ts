import {
    RequestContext,
    ProductVariantService,
    ProductOptionGroupService,
    ProductOptionService,
    ProductService,
    TaxCategoryService,
    StockLocationService,
    ChannelService,
    ProductVariant,
    TaxCategory,
    StockLocation,
    Channel,
    ListQueryOptions,
    ID,
} from '@vendure/core';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import { StockLevelInput } from '@vendure/common/lib/generated-types';
import { getErrorMessage } from '../../../utils/error.utils';

export interface LookupLogger {
    warn(message: string, context?: Record<string, unknown>): void;
}

export const noopLogger: LookupLogger = {
    warn: () => {},
};

export async function findVariantBySku(
    productVariantService: ProductVariantService,
    ctx: RequestContext,
    sku: string,
): Promise<ProductVariant | undefined> {
    const result = await productVariantService.findAll(ctx, {
        filter: { sku: { eq: sku } },
        take: 2,
    } as ListQueryOptions<ProductVariant>);
    if (result.items.length > 1) {
        throw new Error(`Multiple product variants use SKU "${sku}"`);
    }
    return result.items[0];
}

export async function resolveTaxCategoryId(
    taxCategoryService: TaxCategoryService,
    ctx: RequestContext,
    name?: string | null,
    logger: LookupLogger = noopLogger,
): Promise<ID | undefined> {
    if (!name) return undefined;
    const list = await taxCategoryService.findAll(ctx, {
        filter: { name: { eq: name } },
        take: 2,
    } as ListQueryOptions<TaxCategory>);
    if (list.items.length === 0) {
        const error = new Error(`Tax category not found: ${name}`);
        logger.warn(error.message, { taxCategoryName: name });
        throw error;
    }
    if (list.items.length > 1) {
        const error = new Error(`Multiple tax categories use name "${name}"`);
        logger.warn(error.message, { taxCategoryName: name });
        throw error;
    }
    return list.items[0].id;
}

/**
 * Cache for option group and option lookups within a batch.
 * Per-product tracking because Vendure 3.x option groups are owned by a single product (ManyToOne).
 */
export interface OptionGroupCache {
    /** Per-product cache: productId → groupCode → { groupId, options: Map<optionCode, optionId> } */
    productGroups: Map<string, Map<string, { id: ID; options: Map<string, ID> }>>;
    /** Products whose existing option groups have been loaded from DB */
    loadedProducts: Set<string>;
}

export function createOptionGroupCache(): OptionGroupCache {
    return { productGroups: new Map(), loadedProducts: new Set() };
}

type CachedOptionGroup = { id: ID; options: Map<string, ID> };

async function getProductOptionGroups(
    productOptionGroupService: ProductOptionGroupService,
    ctx: RequestContext,
    productId: ID,
    cache: OptionGroupCache,
): Promise<Map<string, CachedOptionGroup>> {
    const productKey = String(productId);
    if (!cache.loadedProducts.has(productKey)) {
        const groups = await productOptionGroupService.getOptionGroupsByProductId(ctx, productId);
        cache.productGroups.set(
            productKey,
            new Map(groups.map(group => [
                group.code,
                {
                    id: group.id,
                    options: new Map(group.options.map(option => [option.code, option.id])),
                },
            ])),
        );
        cache.loadedProducts.add(productKey);
    }
    const groups = cache.productGroups.get(productKey);
    if (!groups) {
        throw new Error(`Option groups could not be loaded for product ${productKey}`);
    }
    return groups;
}

/**
 * Slugify a string for use as an option/group code.
 */
function toOptionCode(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'unknown';
}

/**
 * Resolve option group→value pairs into Vendure option IDs.
 * Creates per-product option groups (Vendure 3.x: each group belongs to exactly one product via ManyToOne).
 * Loads existing groups from DB on first call per product for idempotent re-runs.
 */
export async function resolveOptionGroups(
    productOptionGroupService: ProductOptionGroupService,
    productOptionService: ProductOptionService,
    productService: ProductService,
    ctx: RequestContext,
    productId: ID,
    optionsMap: Record<string, string>,
    cache: OptionGroupCache,
): Promise<ID[]> {
    const optionIds: ID[] = [];
    const langCode = (ctx.languageCode ?? 'en') as LanguageCode;

    const groupMap = await getProductOptionGroups(
        productOptionGroupService,
        ctx,
        productId,
        cache,
    );

    for (const [key, value] of Object.entries(optionsMap)) {
        if (!key || value == null || value === '') continue;

        const groupCode = toOptionCode(key);
        const optionCode = toOptionCode(value);

        let groupEntry = groupMap.get(groupCode);
        if (!groupEntry) {
            const created = await productOptionGroupService.create(ctx, {
                code: groupCode,
                translations: [{ languageCode: langCode, name: key.charAt(0).toUpperCase() + key.slice(1) }],
            });
            await productService.addOptionGroupToProduct(ctx, productId, created.id);
            groupEntry = { id: created.id, options: new Map() };
            groupMap.set(groupCode, groupEntry);
        }

        let optionId = groupEntry.options.get(optionCode);
        if (!optionId) {
            const allOptions = await productOptionService.findAll(ctx, {}, groupEntry.id);
            const existingOption = allOptions.items.find(o => o.code === optionCode);

            if (existingOption) {
                optionId = existingOption.id;
            } else {
                const createdOption = await productOptionService.create(ctx, groupEntry.id, {
                    code: optionCode,
                    translations: [{ languageCode: langCode, name: value }],
                });
                optionId = createdOption.id;
            }
            groupEntry.options.set(optionCode, optionId);
        }

        optionIds.push(optionId);
    }

    return optionIds;
}

/**
 * Resolve option codes (e.g. ['size-s', 'color-blue']) to Vendure option IDs.
 * Limits lookups to the parent product and rejects ambiguous codes.
 */
export async function resolveOptionCodes(
    productOptionGroupService: ProductOptionGroupService,
    ctx: RequestContext,
    productId: ID,
    codes: string[],
    cache: OptionGroupCache,
): Promise<ID[]> {
    const groups = await getProductOptionGroups(
        productOptionGroupService,
        ctx,
        productId,
        cache,
    );
    const optionsByCode = new Map<string, ID[]>();
    for (const group of groups.values()) {
        for (const [code, id] of group.options) {
            const matches = optionsByCode.get(code) ?? [];
            matches.push(id);
            optionsByCode.set(code, matches);
        }
    }

    return codes.map(code => {
        const matches = optionsByCode.get(code) ?? [];
        if (matches.length === 0) {
            throw new Error(`Option code "${code}" was not found for product ${String(productId)}`);
        }
        if (matches.length > 1) {
            throw new Error(`Option code "${code}" is ambiguous for product ${String(productId)}`);
        }
        return matches[0];
    });
}

export async function resolveStockLevels(
    stockLocationService: StockLocationService,
    ctx: RequestContext,
    stockByLocation?: Record<string, number>,
    logger: LookupLogger = noopLogger,
): Promise<StockLevelInput[] | undefined> {
    if (!stockByLocation) return undefined;
    const locNames = Object.keys(stockByLocation);
    if (locNames.length === 0) return undefined;

    try {
        const list = await stockLocationService.findAll(ctx, {
            filter: { name: { in: locNames } },
        } as ListQueryOptions<StockLocation>);

        const locationMap = new Map(list.items.map(l => [l.name, l.id]));
        const missingLocations = locNames.filter(name => !locationMap.has(name));
        if (missingLocations.length > 0) {
            throw new Error(`Stock location${missingLocations.length === 1 ? '' : 's'} not found: ${missingLocations.join(', ')}`);
        }
        const result: StockLevelInput[] = [];

        for (const [name, qty] of Object.entries(stockByLocation)) {
            const locationId = locationMap.get(name);
            result.push({ stockLocationId: locationId as ID, stockOnHand: Math.max(0, Math.floor(qty)) });
        }
        return result;
    } catch (error) {
        logger.warn('Failed to resolve stock locations', {
            locationNames: locNames,
            error: getErrorMessage(error),
        });
        throw error;
    }
}

/**
 * Parse a translations input from a record field into a generic array.
 * Supports two formats:
 * 1. Array: [{ languageCode: 'en', name: '...', ... }, ...]
 * 2. Object map: { en: { name: '...', ... }, de: { ... } } → converted to array
 * Returns generic records; each handler picks the fields it needs.
 */
export function parseTranslationsInput(
    raw: unknown,
): Array<Record<string, unknown> & { languageCode: string }> {
    const entries: Array<Record<string, unknown> & { languageCode: string }> = [];
    if (Array.isArray(raw)) {
        for (let index = 0; index < raw.length; index++) {
            const value = raw[index];
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error(`Translation at index ${index} must be an object`);
            }
            const entry = value as Record<string, unknown>;
            entries.push({
                ...entry,
                languageCode: parseTranslationLanguageCode(
                    entry.languageCode,
                    `translation at index ${index}`,
                ),
            });
        }
    } else if (raw && typeof raw === 'object') {
        for (const [languageCode, value] of Object.entries(raw as Record<string, unknown>)) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error(`Translation "${languageCode}" must be an object`);
            }
            entries.push({
                ...(value as Record<string, unknown>),
                languageCode: parseTranslationLanguageCode(
                    languageCode,
                    `translation map key "${languageCode}"`,
                ),
            });
        }
    } else {
        throw new Error('Translations must be an array or language map');
    }

    const seen = new Set<string>();
    for (const entry of entries) {
        if (seen.has(entry.languageCode)) {
            throw new Error(`Duplicate translation language "${entry.languageCode}"`);
        }
        seen.add(entry.languageCode);
    }
    return entries;
}

function parseTranslationLanguageCode(value: unknown, source: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Language code for ${source} must be a non-empty string`);
    }
    const languageCode = value.trim();
    if (!Object.values(LanguageCode).includes(languageCode as LanguageCode)) {
        throw new Error(`Unsupported translation language code "${languageCode}"`);
    }
    return languageCode;
}

export function getTranslationString(
    translation: Record<string, unknown>,
    field: string,
): string | undefined;
export function getTranslationString(
    translation: Record<string, unknown>,
    field: string,
    fallback: string,
): string;
export function getTranslationString(
    translation: Record<string, unknown>,
    field: string,
    fallback?: string,
): string | undefined {
    const value = translation[field];
    if (value == null) {
        return fallback;
    }
    if (typeof value !== 'string') {
        throw new Error(`Translation field "${field}" must be a string`);
    }
    return value;
}

/**
 * Shape of a configurable operation from record data (used by shipping-method, payment-method handlers)
 */
export interface ConfigurableOperationRecord {
    code: string;
    args?: Record<string, unknown>;
}

/**
 * Convert a raw record value to a ConfigurableOperationInput.
 * Shared by ShippingMethodHandler and PaymentMethodHandler.
 */
export function toConfigurableOperation(
    value: unknown,
): { code: string; arguments: Array<{ name: string; value: string }> } | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as ConfigurableOperationRecord;
    if (!record.code || typeof record.code !== 'string') return null;

    return {
        code: record.code,
        arguments: Object.entries(record.args || {}).map(([name, val]) => ({
            name,
            value: typeof val === 'string' ? val : JSON.stringify(val),
        })),
    };
}

/**
 * Resolve channel codes to channel IDs.
 * Uses a shared cache (Map<string, ID>) for batch efficiency.
 * Accepts either an array of codes or a comma-separated string.
 */
export async function resolveChannelIds(
    channelService: ChannelService,
    ctx: RequestContext,
    rawValue: unknown,
    cache: Map<string, ID>,
    logger: LookupLogger = noopLogger,
): Promise<ID[]> {
    let codes: string[];
    if (Array.isArray(rawValue)) {
        codes = rawValue.map((value, index) => {
            if (typeof value !== 'string' || value.trim() === '') {
                throw new Error(`Channel code at index ${index} must be a non-empty string`);
            }
            return value.trim();
        });
    } else if (typeof rawValue === 'string') {
        codes = rawValue.split(',').map(s => s.trim()).filter(Boolean);
    } else {
        throw new Error('Channel assignment must be a channel code or an array of channel codes');
    }

    codes = [...new Set(codes)];
    if (codes.length === 0) return [];

    const uncached: string[] = [];

    for (const code of codes) {
        if (!cache.has(code)) {
            uncached.push(code);
        }
    }

    if (uncached.length > 0) {
        try {
            const allChannels = await channelService.findAll(ctx, {
                filter: { code: { in: uncached } },
            } as ListQueryOptions<Channel>);

            for (const channel of allChannels.items) {
                cache.set(channel.code, channel.id);
            }
        } catch (error) {
            logger.warn('Failed to resolve channel codes', {
                codes: uncached,
                error: getErrorMessage(error),
            });
            throw error;
        }
    }

    const missingCodes = codes.filter(code => !cache.has(code));
    if (missingCodes.length > 0) {
        const error = new Error(`Channel code${missingCodes.length === 1 ? '' : 's'} not found: ${missingCodes.join(', ')}`);
        logger.warn(error.message, { codes: missingCodes });
        throw error;
    }

    return codes.map(code => cache.get(code) as ID);
}
