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
        case 'contains':
            queryBuilder.andWhere(`entity.${filter.field} LIKE :${paramName}`, { [paramName]: `%${filter.value}%` });
            break;
    }
}

/** Entity-like object with common Vendure entity properties */
export interface EntityLike {
    id?: unknown;
    createdAt?: Date;
    updatedAt?: Date;
    [key: string]: unknown;
}

/**
 * Convert entity to JSON record
 */
export function entityToRecord(entity: EntityLike, config: VendureQueryExtractorConfig): JsonObject {
    const record: JsonObject = {};
    const languageCode = config.languageCode;
    const shouldFlatten = config.flattenTranslations !== false && !!languageCode;

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

        // Handle translations array - flatten if language is specified
        if (key === 'translations' && shouldFlatten && Array.isArray(value)) {
            const translation = findTranslation(value, languageCode);
            if (translation) {
                // Merge translation fields into root record
                for (const [transKey, transValue] of Object.entries(translation)) {
                    // Skip languageCode and id from translation
                    if (transKey === 'languageCode' || transKey === 'id') continue;
                    if (typeof transValue === 'function' || transValue === undefined) continue;
                    if (transValue instanceof Date) {
                        record[transKey] = transValue.toISOString();
                    } else if (transValue === null || typeof transValue === 'string' || typeof transValue === 'number' || typeof transValue === 'boolean') {
                        record[transKey] = transValue;
                    }
                }
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
                    typeof item === 'object' ? (serializeObject(item as Record<string, unknown>) ?? null) : item
                ) as JsonValue;
            } else {
                record[key] = serializeObject(value as Record<string, unknown>) ?? null;
            }
        }
        // Primitive values (string, number, boolean, null)
        else if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            record[key] = value;
        }
    }

    return record;
}

/**
 * Find translation for a specific language code
 * Falls back to first translation if exact match not found
 */
function findTranslation(translations: unknown[], languageCode: string): Record<string, unknown> | null {
    if (!translations || translations.length === 0) return null;

    // First try exact match
    const exactMatch = translations.find((t: unknown) =>
        t && typeof t === 'object' && (t as Record<string, unknown>).languageCode === languageCode
    );
    if (exactMatch) return exactMatch as Record<string, unknown>;

    // Fall back to first translation
    const first = translations[0];
    if (first && typeof first === 'object') return first as Record<string, unknown>;

    return null;
}

/**
 * Serialize object to JSON-compatible format
 */
export function serializeObject(obj: Record<string, unknown> | null): JsonObject | null {
    if (obj === null) return null;

    const result: JsonObject = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'function' || value === undefined) continue;
        if (value instanceof Date) {
            result[key] = value.toISOString();
        } else if (typeof value === 'object' && value !== null) {
            // Don't recurse too deep
            result[key] = Array.isArray(value) ? value.length : '[object]';
        } else {
            result[key] = value as JsonValue;
        }
    }
    return result;
}
