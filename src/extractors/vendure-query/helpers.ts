/**
 * Vendure Query Extractor - Helpers
 *
 * Helper functions for Vendure entity queries.
 */

import {
    Product,
    ProductVariant,
    Customer,
    Collection,
    Facet,
    FacetValue,
    Order,
    Promotion,
    Asset,
} from '@vendure/core';
import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { JsonObject, JsonValue } from '../../types/index';
import { VendureEntityType } from '../../types/index';
import { VendureQueryFilter, VendureQueryExtractorConfig } from './types';
import { escapeLikePattern } from '../../utils/sql-security.utils';

/** Type for Vendure entity classes (using Function to avoid strict class type issues) */
type EntityClass = typeof Product | typeof ProductVariant | typeof Customer | typeof Collection | typeof Facet | typeof FacetValue | typeof Order | typeof Promotion | typeof Asset;

/**
 * Entity class map for Vendure entities
 * Not all entity types have directly importable class - some are undefined
 */
const ENTITY_CLASS_MAP: Partial<Record<VendureEntityType, EntityClass>> = {
    PRODUCT: Product,
    PRODUCT_VARIANT: ProductVariant,
    CUSTOMER: Customer,
    COLLECTION: Collection,
    FACET: Facet,
    FACET_VALUE: FacetValue,
    ORDER: Order,
    PROMOTION: Promotion,
    ASSET: Asset,
    // Entities that don't have direct class exports or need different handling
    // STOCK_LOCATION, INVENTORY, SHIPPING_METHOD, CUSTOMER_GROUP, TAG, TAX_CATEGORY,
    // COUNTRY, ZONE, PAYMENT_METHOD are not included as they need special handling
};

/**
 * Map entity type string to Vendure entity class
 * Normalizes the input to uppercase for case-insensitive matching
 */
export function getEntityClass(entityType: VendureEntityType | string): EntityClass | undefined {
    const normalized = String(entityType).toUpperCase() as VendureEntityType;
    return ENTITY_CLASS_MAP[normalized];
}

const VALID_FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

export function validateFieldName(field: string): boolean {
    return VALID_FIELD_NAME_PATTERN.test(field) && field.length <= 128;
}

/**
 * Apply filter to query builder
 */
export function applyFilter<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    filter: VendureQueryFilter,
): void {
    if (!validateFieldName(filter.field)) {
        throw new Error(`Invalid field name: ${filter.field}`);
    }

    const paramName = `filter_${filter.field.replace(/\./g, '_')}`;

    switch (filter.operator) {
        case 'eq':
            queryBuilder.andWhere(`entity.${filter.field} = :${paramName}`, { [paramName]: filter.value });
            break;
        case 'ne':
            queryBuilder.andWhere(`entity.${filter.field} != :${paramName}`, { [paramName]: filter.value });
            break;
        case 'gt':
            queryBuilder.andWhere(`entity.${filter.field} > :${paramName}`, { [paramName]: filter.value });
            break;
        case 'gte':
            queryBuilder.andWhere(`entity.${filter.field} >= :${paramName}`, { [paramName]: filter.value });
            break;
        case 'lt':
            queryBuilder.andWhere(`entity.${filter.field} < :${paramName}`, { [paramName]: filter.value });
            break;
        case 'lte':
            queryBuilder.andWhere(`entity.${filter.field} <= :${paramName}`, { [paramName]: filter.value });
            break;
        case 'in':
            queryBuilder.andWhere(`entity.${filter.field} IN (:...${paramName})`, { [paramName]: filter.value });
            break;
        case 'like':
        case 'contains': {
            const escaped = escapeLikePattern(String(filter.value));
            queryBuilder.andWhere(`entity.${filter.field} LIKE :${paramName}`, { [paramName]: `%${escaped}%` });
            break;
        }
    }
}

/** Maximum recursion depth for nested object serialization to prevent circular reference loops */
const MAX_SERIALIZATION_DEPTH = 3;

/** Check if a value is a JSON-compatible primitive (string, number, boolean, or null) */
function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
    return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Flatten translation fields into a target record.
 * Extracts key-value pairs from a translation object, skipping metadata fields
 * (languageCode, id) and non-serializable values (functions, undefined).
 */
function flattenTranslationFields(translation: Record<string, unknown>, target: JsonObject): void {
    for (const [transKey, transValue] of Object.entries(translation)) {
        if (transKey === 'languageCode' || transKey === 'id') continue;
        if (typeof transValue === 'function' || transValue === undefined) continue;
        if (transValue instanceof Date) {
            target[transKey] = transValue.toISOString();
        } else if (isJsonPrimitive(transValue)) {
            target[transKey] = transValue;
        }
    }
}

export interface EntityLike {
    id?: unknown;
    createdAt?: Date;
    updatedAt?: Date;
    [key: string]: unknown;
}

/**
 * Convert entity to JSON record.
 * Automatically flattens translations when present (uses languageCode if configured,
 * falls back to first available translation). Also resolves computed price fields
 * from productVariantPrices relation when loaded.
 */
export function entityToRecord(entity: EntityLike, config: VendureQueryExtractorConfig): JsonObject {
    const record: JsonObject = {};
    const languageCode = config.languageCode;
    const shouldFlatten = config.flattenTranslations !== false;

    // Get all enumerable properties
    for (const [key, value] of Object.entries(entity)) {
        // Skip excluded fields
        if (config.excludeFields?.includes(key)) {
            continue;
        }

        // Only include specified fields if configured
        if (config.includeFields?.length && !config.includeFields.includes(key)) {
            continue;
        }

        // Skip functions and undefined
        if (typeof value === 'function' || value === undefined) {
            continue;
        }

        // Handle translations array - flatten if present
        if (key === 'translations' && shouldFlatten && Array.isArray(value) && value.length > 0) {
            const translation = findTranslation(value, languageCode);
            if (translation) {
                flattenTranslationFields(translation, record);
            }
            continue; // Don't add raw translations array
        }

        // Handle dates
        if (value instanceof Date) {
            record[key] = value.toISOString();
        }
        // Handle nested objects/arrays (relations)
        else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                record[key] = value.map(item =>
                    item instanceof Date ? item.toISOString() :
                    typeof item === 'object' ? (serializeObject(item as Record<string, unknown>, languageCode, 0, shouldFlatten) ?? null) : item
                ) as JsonValue;
            } else {
                record[key] = serializeObject(value as Record<string, unknown>, languageCode, 0, shouldFlatten) ?? null;
            }
        }
        // Primitive values (string, number, boolean, null)
        else if (isJsonPrimitive(value)) {
            record[key] = value;
        }
    }

    // Resolve computed price fields from productVariantPrices relation
    resolveVariantPriceFields(entity, record);

    return record;
}

/**
 * Auto-resolve price/priceWithTax/currencyCode from productVariantPrices relation.
 * These are getter/calculated fields on ProductVariant that TypeORM doesn't populate
 * when loading via raw QueryBuilder. Resolves from the best available price entry
 * (prefers non-zero prices since zero-price entries may be stale channel defaults).
 */
function resolveVariantPriceFields(entity: EntityLike, record: JsonObject): void {
    if (!Array.isArray(entity.productVariantPrices) || entity.productVariantPrices.length === 0) return;
    const prices = entity.productVariantPrices as Array<Record<string, unknown>>;

    // Prefer a non-zero price entry (zero may be an uninitialized channel price)
    const bestPrice = prices.find(p => typeof p.price === 'number' && p.price > 0) ?? prices[0];
    if (!bestPrice || typeof bestPrice.price !== 'number') return;

    // Override zero/undefined prices. TypeORM loads ProductVariant getters (price, priceWithTax)
    // as own properties returning 0 since listPrice is not populated by raw query builder.
    // The real price lives in productVariantPrices entries.
    if (!record.price || record.price === 0) record.price = bestPrice.price;
    if (!record.listPrice || record.listPrice === 0) record.listPrice = bestPrice.price;
    if (!record.priceWithTax || record.priceWithTax === 0) record.priceWithTax = bestPrice.price;
    if (record.currencyCode === undefined && typeof bestPrice.currencyCode === 'string') {
        record.currencyCode = bestPrice.currencyCode;
    }
}

/**
 * Find translation for a specific language code.
 * Falls back to first translation if exact match not found or languageCode is undefined.
 */
function findTranslation(translations: unknown[], languageCode?: string): Record<string, unknown> | null {
    if (!translations || translations.length === 0) return null;

    // First try exact match if languageCode is provided
    if (languageCode) {
        const exactMatch = translations.find((t: unknown) =>
            t && typeof t === 'object' && (t as Record<string, unknown>).languageCode === languageCode
        );
        if (exactMatch) return exactMatch as Record<string, unknown>;
    }

    // Fall back to first translation
    const first = translations[0];
    if (first && typeof first === 'object') return first as Record<string, unknown>;

    return null;
}

/**
 * Serialize object to JSON-compatible format with depth-limited recursion.
 * Flattens translations in nested entities when languageCode is provided
 * (or uses first available translation). Recurses up to MAX_SERIALIZATION_DEPTH
 * levels deep to handle nested relations without infinite loops from circular references.
 */
export function serializeObject(
    obj: Record<string, unknown> | null,
    languageCode?: string,
    depth: number = 0,
    flattenTranslations: boolean = true,
): JsonObject | null {
    if (obj === null || depth > MAX_SERIALIZATION_DEPTH) return null;

    const result: JsonObject = {};

    // Flatten translations for nested entities (e.g., product.translations → product.name)
    // Only flatten if flattenTranslations is true; otherwise preserve raw translations arrays
    if (flattenTranslations && Array.isArray(obj.translations) && obj.translations.length > 0) {
        const translation = findTranslation(obj.translations as unknown[], languageCode);
        if (translation) {
            flattenTranslationFields(translation, result);
        }
    }

    for (const [key, value] of Object.entries(obj)) {
        // Skip translations only if we flattened them above
        if (key === 'translations' && Array.isArray(value) && flattenTranslations) continue;
        if (typeof value === 'function' || value === undefined) continue;
        if (value instanceof Date) {
            result[key] = value.toISOString();
        } else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                result[key] = value.map(item =>
                    item instanceof Date ? item.toISOString() :
                    typeof item === 'object' && item !== null ? (serializeObject(item as Record<string, unknown>, languageCode, depth + 1, flattenTranslations) ?? null) :
                    item
                ) as JsonValue;
            } else {
                result[key] = serializeObject(value as Record<string, unknown>, languageCode, depth + 1, flattenTranslations) ?? null;
            }
        } else {
            result[key] = value as JsonValue;
        }
    }
    return result;
}
