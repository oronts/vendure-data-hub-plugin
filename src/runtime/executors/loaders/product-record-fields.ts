import {
    CurrencyCode,
    GlobalFlag,
    StockLevelInput,
} from '@vendure/common/lib/generated-types';
import {
    PipelineStepDefinition,
    ProductUpsertLoaderConfig,
} from '../../../types';
import {
    getBooleanValue,
    getNumberValue,
    getObjectValue,
    getStringValue,
    slugify,
} from '../../../loaders/shared-helpers';
import { majorToMinorUnits } from '../../../utils/money.utils';
import { RecordObject } from '../../executor-types';
import { CoercedProductFields } from './types';

export function getProductHandlerConfig(
    config: PipelineStepDefinition['config'],
): ProductUpsertLoaderConfig {
    return config as unknown as ProductUpsertLoaderConfig;
}

function parsePriceByCurrency(
    priceObject: Record<string, unknown>,
    precision: number,
): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [rawCurrencyCode, value] of Object.entries(priceObject)) {
        const currencyCode = rawCurrencyCode.toUpperCase();
        if (!Object.values(CurrencyCode).includes(currencyCode as CurrencyCode)) {
            throw new Error(`Invalid currency code "${rawCurrencyCode}"`);
        }
        result[currencyCode] = majorToMinorUnits(value, precision);
    }
    if (Object.keys(result).length === 0) {
        throw new Error('Price map cannot be empty');
    }
    return result;
}

function parseStockByLocation(
    stockObject: Record<string, unknown>,
): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [locationName, value] of Object.entries(stockObject)) {
        const numericValue = typeof value === 'number'
            ? value
            : typeof value === 'string' && value.trim() !== ''
                ? Number(value)
                : Number.NaN;
        if (Number.isFinite(numericValue)) {
            result[locationName] = Math.max(0, Math.floor(numericValue));
        }
    }
    return result;
}

export function buildVariantPrices(
    priceMinor: number | undefined,
    priceByCurrency: Record<string, number> | undefined,
): { prices?: Array<{ currencyCode: CurrencyCode; price: number }>; price?: number } {
    const result: {
        prices?: Array<{ currencyCode: CurrencyCode; price: number }>;
        price?: number;
    } = {};
    if (priceByCurrency) {
        result.prices = Object.entries(priceByCurrency).map(([currencyCode, price]) => ({
            currencyCode: currencyCode as CurrencyCode,
            price,
        }));
    }
    if (typeof priceMinor === 'number') {
        result.price = priceMinor;
    }
    return result;
}

export function buildVariantStockFields(
    stockOnHand: number | undefined,
    stockLevels: StockLevelInput[] | undefined,
    trackInventory: boolean | undefined,
): {
    stockOnHand?: number;
    stockLevels?: StockLevelInput[];
    trackInventory?: GlobalFlag;
} {
    const result: {
        stockOnHand?: number;
        stockLevels?: StockLevelInput[];
        trackInventory?: GlobalFlag;
    } = {};
    if (typeof stockOnHand === 'number') {
        result.stockOnHand = stockOnHand;
    }
    if (stockLevels && stockLevels.length > 0) {
        result.stockLevels = stockLevels;
    }
    if (typeof trackInventory === 'boolean') {
        result.trackInventory = trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE;
    }
    return result;
}

function extractPriceFields(
    record: RecordObject,
    priceField: string,
    priceByCurrencyField: string | undefined,
    precision: number,
): {
    priceMinor: number | undefined;
    priceByCurrency: Record<string, number> | undefined;
} {
    const priceValue = record[priceField];
    const configuredPriceMap = priceByCurrencyField
        ? record[priceByCurrencyField]
        : undefined;
    const inlinePriceMap = priceValue && typeof priceValue === 'object' && !Array.isArray(priceValue)
        ? priceValue as Record<string, unknown>
        : undefined;

    if (configuredPriceMap != null && priceValue != null) {
        throw new Error('Configure either priceField or priceByCurrencyField data, not both');
    }

    const priceMap = configuredPriceMap ?? inlinePriceMap;
    if (priceMap != null) {
        if (typeof priceMap !== 'object' || Array.isArray(priceMap)) {
            throw new Error('Currency prices must be an object');
        }
        return {
            priceMinor: undefined,
            priceByCurrency: parsePriceByCurrency(
                priceMap as Record<string, unknown>,
                precision,
            ),
        };
    }
    if (priceValue != null) {
        return {
            priceMinor: majorToMinorUnits(priceValue, precision),
            priceByCurrency: undefined,
        };
    }

    return { priceMinor: undefined, priceByCurrency: undefined };
}

function extractStockFields(
    record: RecordObject,
    config: ProductUpsertLoaderConfig | undefined,
): {
    stockOnHand: number | undefined;
    stockByLocation: Record<string, number> | undefined;
} {
    const stockField = config?.stockField ?? 'stockOnHand';
    const stockValue = getNumberValue(record, stockField);
    const stockOnHand = typeof stockValue === 'number'
        ? Math.max(0, Math.floor(stockValue))
        : undefined;

    const stockByLocationField = config?.stockByLocationField;
    const stockMap = stockByLocationField
        ? getObjectValue(record, stockByLocationField)
        : undefined;
    const stockByLocation = stockMap
        ? parseStockByLocation(stockMap)
        : undefined;

    return { stockOnHand, stockByLocation };
}

function parseTrackInventory(
    config: ProductUpsertLoaderConfig | undefined,
): boolean | undefined {
    const value = String(config?.trackInventory ?? '').toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
}

function extractSlug(
    record: RecordObject,
    slugField: string,
    name: string | undefined,
): string | undefined {
    const slug = getStringValue(record, slugField);
    return slug || (name ? slugify(name) : undefined);
}

function extractSku(
    record: RecordObject,
    skuField: string,
    slug: string | undefined,
): string | undefined {
    const sku = getStringValue(record, skuField)
        || getStringValue(record, 'variantSku');
    return sku || (slug ? slug.toUpperCase() : undefined);
}

export function parseFacetValueCodes(value: unknown): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new Error('Product facet values must be an array');
    }

    return value.map((item, index) => {
        if (typeof item === 'string' && item.trim()) {
            return item.trim();
        }
        if (item && typeof item === 'object') {
            const code = Reflect.get(item, 'code');
            if (typeof code === 'string' && code.trim()) {
                return code.trim();
            }
        }
        throw new Error(`Invalid product facet value at index ${index}`);
    });
}

export function coerceProductFields(
    record: RecordObject,
    config: ProductUpsertLoaderConfig | undefined,
    moneyPrecision: number,
): CoercedProductFields {
    const nameField = config?.nameField ?? 'name';
    const slugField = config?.slugField ?? 'slug';
    const descriptionField = config?.descriptionField ?? 'description';
    const skuField = config?.skuField ?? 'sku';
    const priceField = config?.priceField ?? 'price';
    const name = getStringValue(record, nameField) || undefined;
    const description = getStringValue(record, descriptionField);
    const slug = extractSlug(record, slugField, name);
    const sku = extractSku(record, skuField, slug);
    const { priceMinor, priceByCurrency } = extractPriceFields(
        record,
        priceField,
        config?.priceByCurrencyField,
        moneyPrecision,
    );
    const { stockOnHand, stockByLocation } = extractStockFields(record, config);
    const trackInventory = parseTrackInventory(config);
    const customFields = getObjectValue(
        record,
        config?.customFieldsField ?? 'customFields',
    );
    const enabled = getBooleanValue(record, config?.enabledField ?? 'enabled');

    return {
        slug,
        name,
        description,
        sku,
        priceMinor,
        priceByCurrency,
        trackInventory,
        stockOnHand,
        stockByLocation,
        customFields,
        enabled,
    };
}
