import { ConfigService, RequestContext } from '@vendure/core';
import {
    CurrencyCode,
    LanguageCode,
    UpdateProductVariantPriceInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, AssetsMode, FeaturedAssetMode } from '../../../types';
import { LoadStrategy } from '../../../constants/enums';
import { RecordObject } from '../../executor-types';
import { getStringValue } from '../../../loaders/shared-helpers';
import { getNestedValue } from '../../../utils/object-path.utils';
import { majorToMinorUnits, resolveMoneyPrecision } from '../../../utils/money.utils';
import { getTranslationString, parseTranslationsInput } from './shared-lookups';
import { CreateDuplicateHandlingConfig } from './duplicate-handling';

export interface VariantHandlerConfig extends CreateDuplicateHandlingConfig {
    skuField?: string;
    nameField?: string;
    priceField?: string;
    priceByCurrencyField?: string;
    taxCategoryName?: string;
    stockField?: string;
    stockByLocationField?: string;
    customFieldsField?: string;
    optionGroupsField?: string;
    optionIdsField?: string;
    optionCodesField?: string;
    enabledField?: string;
    channelsField?: string;
    translationsField?: string;
    channel?: string;
    strategy?: LoadStrategy;
    assetsField?: string;
    assetsMode?: AssetsMode;
    featuredAssetField?: string;
    featuredAssetMode?: FeaturedAssetMode;
}

export interface VariantHandlerSettings {
    config: VariantHandlerConfig;
    skuKey: string;
    nameKey: string;
    priceKey: string;
    stockKey: string;
    customFieldsKey: string;
    enabledKey: string;
    strategy: LoadStrategy;
    moneyPrecision: number;
}

export interface VariantPrices {
    priceMinor?: number;
    prices?: UpdateProductVariantPriceInput[];
}

export function resolveVariantHandlerSettings(
    step: PipelineStepDefinition,
    configService: ConfigService,
): VariantHandlerSettings {
    const config = step.config as unknown as VariantHandlerConfig;
    return {
        config,
        skuKey: config.skuField ?? 'sku',
        nameKey: config.nameField ?? 'name',
        priceKey: config.priceField ?? 'price',
        stockKey: config.stockField ?? 'stockOnHand',
        customFieldsKey: config.customFieldsField ?? 'customFields',
        enabledKey: config.enabledField ?? 'enabled',
        strategy: config.strategy ?? LoadStrategy.UPSERT,
        moneyPrecision: resolveMoneyPrecision(configService),
    };
}

export function parseChannelCodes(value: unknown): string[] {
    const values = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',')
            : [];
    return values
        .filter((entry): entry is string => typeof entry === 'string')
        .map(entry => entry.trim())
        .filter(Boolean);
}

export function getVariantName(
    record: RecordObject,
    config: VariantHandlerConfig,
    nameField: string,
): string | undefined {
    const name = getStringValue(record, nameField);
    if (name || !config.translationsField) return name;
    const raw = record[config.translationsField];
    if (!raw) return undefined;
    const first = parseTranslationsInput(raw)[0];
    return first ? getTranslationString(first, 'name') : undefined;
}

export function buildVariantTranslations(
    ctx: RequestContext,
    record: RecordObject,
    config: VariantHandlerConfig,
    name: string,
): Array<{ languageCode: LanguageCode; name: string }> {
    if (config.translationsField) {
        const raw = record[config.translationsField];
        if (raw) {
            const parsed = parseTranslationsInput(raw);
            if (parsed.length > 0) {
                return parsed.map(translation => ({
                    languageCode: translation.languageCode as LanguageCode,
                    name: getTranslationString(translation, 'name', name),
                }));
            }
        }
    }
    return [{ languageCode: ctx.languageCode as LanguageCode, name }];
}

export function extractVariantPrices(
    record: RecordObject,
    priceKey: string,
    priceMapKey: string | undefined,
    precision: number,
    contexts: readonly RequestContext[],
): VariantPrices {
    const priceRaw = record[priceKey];
    const priceMapRaw = priceMapKey ? record[priceMapKey] : undefined;
    if (priceMapRaw != null && priceRaw != null) {
        throw new Error('Configure either priceField or priceByCurrencyField data, not both');
    }
    if (priceMapRaw != null) {
        return { prices: parseCurrencyPrices(priceMapRaw, precision, contexts) };
    }
    return priceRaw != null
        ? { priceMinor: majorToMinorUnits(priceRaw, precision) }
        : {};
}

function parseCurrencyPrices(
    value: unknown,
    precision: number,
    contexts: readonly RequestContext[],
): UpdateProductVariantPriceInput[] {
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Currency prices must be an object');
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
        throw new Error('Price map cannot be empty');
    }
    return entries.map(([rawCurrencyCode, price]) => ({
        currencyCode: validateCurrencyCode(rawCurrencyCode, contexts),
        price: majorToMinorUnits(price, precision),
    }));
}

function validateCurrencyCode(
    rawCurrencyCode: string,
    contexts: readonly RequestContext[],
): CurrencyCode {
    const currencyCode = rawCurrencyCode.toUpperCase();
    if (!Object.values(CurrencyCode).includes(currencyCode as CurrencyCode)) {
        throw new Error(`Invalid currency code "${rawCurrencyCode}"`);
    }
    const availableCurrencies = new Set(
        contexts.flatMap(context => context.channel?.availableCurrencyCodes ?? []),
    );
    if (availableCurrencies.size > 0 && !availableCurrencies.has(currencyCode as CurrencyCode)) {
        throw new Error(
            `Currency "${currencyCode}" is not available in the selected channels`,
        );
    }
    return currencyCode as CurrencyCode;
}

export function filterVariantPricesForContext(
    prices: readonly UpdateProductVariantPriceInput[] | undefined,
    ctx: RequestContext,
): UpdateProductVariantPriceInput[] | undefined {
    if (!prices) return undefined;
    const availableCurrencies = ctx.channel?.availableCurrencyCodes ?? [];
    const filtered = prices.filter(price => availableCurrencies.includes(price.currencyCode));
    return filtered.length > 0 ? filtered : undefined;
}

export function assertDefaultCurrencyPrices(
    prices: readonly UpdateProductVariantPriceInput[] | undefined,
    contexts: readonly RequestContext[],
): void {
    if (!prices) return;
    for (const context of contexts) {
        const defaultCurrencyCode = context.channel.defaultCurrencyCode;
        if (!prices.some(price => price.currencyCode === defaultCurrencyCode)) {
            throw new Error(
                `Currency prices must include the default currency "${defaultCurrencyCode}" for channel "${context.channel.code}"`,
            );
        }
    }
}

export function parseVariantEnabled(value: unknown): boolean | undefined {
    if (value == null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    throw new Error('Variant enabled value must be a boolean or "true"/"false" string');
}

export function parseVariantStockOnHand(
    record: RecordObject,
    field: string,
): number | undefined {
    const value = getRecordValue(record, field);
    if (value == null) return undefined;
    return parseFiniteStock(value, field);
}

export function parseVariantStockByLocation(
    record: RecordObject,
    field: string | undefined,
): Record<string, number> | undefined {
    if (!field) return undefined;
    const value = getRecordValue(record, field);
    if (value == null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Variant field "${field}" must be a stock-location object`);
    }
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([location, quantity]) => [
            location,
            parseFiniteStock(quantity, `${field}.${location}`),
        ]),
    );
}

function getRecordValue(record: RecordObject, field: string): unknown {
    return field.includes('.')
        ? getNestedValue(record as Record<string, unknown>, field)
        : record[field];
}

function parseFiniteStock(value: unknown, field: string): number {
    const quantity = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : Number.NaN;
    if (!Number.isFinite(quantity)) {
        throw new Error(`Variant field "${field}" must be a finite number`);
    }
    return quantity;
}
