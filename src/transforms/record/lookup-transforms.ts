/**
 * Lookup Transforms
 *
 * Transform operations for looking up and mapping values.
 * Includes Vendure entity lookups and static value mapping.
 */

import {
    RequestContext,
    TransactionalConnection,
    Product,
    ProductVariant,
    Customer,
    Collection,
    Facet,
    FacetValue,
    Asset,
    CustomerGroup,
} from '@vendure/core';
import { TransformConfig, VendureEntityType } from '../../types/index';
import { JsonValue } from '../../types/index';
import { LookupType } from '../../constants/enums';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubLogger } from '../../services/logger';
import { getErrorMessage } from '../../utils/error.utils';

const logger = new DataHubLogger(LOGGER_CONTEXTS.LOOKUP_TRANSFORMS);

// VENDURE ENTITY MAPPING

type SupportedEntityClass =
    | typeof Product
    | typeof ProductVariant
    | typeof Customer
    | typeof Collection
    | typeof Facet
    | typeof FacetValue
    | typeof Asset
    | typeof CustomerGroup;

/**
 * Supported entity types for lookup transforms
 * Maps VendureEntityType values to their corresponding entity classes
 */
const SUPPORTED_ENTITY_TYPES = {
    Product: 'Product',
    ProductVariant: 'ProductVariant',
    Customer: 'Customer',
    Collection: 'Collection',
    Facet: 'Facet',
    FacetValue: 'FacetValue',
    Asset: 'Asset',
    CustomerGroup: 'CustomerGroup',
} as const;

/**
 * Map of entity types to their corresponding Vendure entity classes
 * Uses the entity type string (matching VendureEntityType values) as keys
 */
const ENTITY_CLASS_MAP: Record<string, SupportedEntityClass> = {
    [SUPPORTED_ENTITY_TYPES.Product]: Product,
    [SUPPORTED_ENTITY_TYPES.ProductVariant]: ProductVariant,
    [SUPPORTED_ENTITY_TYPES.Customer]: Customer,
    [SUPPORTED_ENTITY_TYPES.Collection]: Collection,
    [SUPPORTED_ENTITY_TYPES.Facet]: Facet,
    [SUPPORTED_ENTITY_TYPES.FacetValue]: FacetValue,
    [SUPPORTED_ENTITY_TYPES.Asset]: Asset,
    [SUPPORTED_ENTITY_TYPES.CustomerGroup]: CustomerGroup,
};

/**
 * Default field names used in lookup operations
 */
const LOOKUP_DEFAULTS = {
    /** Default field to search by */
    FROM_FIELD: 'code',
    /** Default field to return */
    TO_FIELD: 'id',
} as const;

/**
 * Get Vendure entity class from type string
 *
 * @param entityType - The entity type string
 * @returns Entity class or null if not supported
 */
export function getEntityClass(entityType: VendureEntityType): SupportedEntityClass | null {
    return ENTITY_CLASS_MAP[entityType] ?? null;
}

// LOOKUP FUNCTIONS

/**
 * Lookup value from Vendure entity
 * Queries database to find entity and returns specified field
 *
 * @param ctx - The request context for database access
 * @param value - The value to search for
 * @param entityType - The type of entity to search
 * @param fromField - The field to search by (defaults to 'code')
 * @param toField - The field to return (defaults to 'id')
 * @param connection - The database connection
 * @returns Found field value or null
 */
export async function vendureEntityLookup(
    ctx: RequestContext,
    value: JsonValue,
    entityType: VendureEntityType,
    fromField: string | undefined,
    toField: string | undefined,
    connection: TransactionalConnection,
): Promise<JsonValue> {
    // Early return for null/undefined values
    if (value === null || value === undefined) {
        return null;
    }

    const from = fromField ?? LOOKUP_DEFAULTS.FROM_FIELD;
    const to = toField ?? LOOKUP_DEFAULTS.TO_FIELD;

    const entityClass = getEntityClass(entityType);
    if (entityClass == null) {
        logger.warn(`Unsupported entity type for lookup: ${entityType}`);
        return null;
    }

    try {
        const repo = connection.getRepository(ctx, entityClass);
        const whereClause = { [from]: value } as Record<string, JsonValue>;
        const entity = await repo.findOne({ where: whereClause });
        if (entity != null) {
            const entityRecord = entity as unknown as Record<string, unknown>;
            const result = entityRecord[to];
            return (result as JsonValue) ?? null;
        }
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.warn(`Lookup failed for ${entityType}.${from}=${String(value)}: ${errorMessage}`);
    }

    return null;
}

/**
 * Perform lookup operation
 * Supports Vendure entity lookup and static value mapping
 *
 * @param ctx - The request context
 * @param value - The value to look up
 * @param config - The transform configuration
 * @param connection - The database connection
 * @returns Looked up value or the original value
 */
export async function performLookup(
    ctx: RequestContext,
    value: JsonValue,
    config: TransformConfig,
    connection: TransactionalConnection,
): Promise<JsonValue> {
    // Early return for null/undefined values
    if (value === null || value === undefined) {
        return null;
    }

    // Vendure entity lookup
    if (config.lookupType === LookupType.VENDURE_ENTITY && config.entityType != null) {
        return vendureEntityLookup(
            ctx,
            value,
            config.entityType as VendureEntityType,
            config.fromField,
            config.toField,
            connection,
        );
    }

    // Static value mapping
    if (config.values != null) {
        const key = String(value);
        return config.values[key] ?? config.defaultValue ?? null;
    }

    return value;
}

/**
 * Apply map transform (static value mapping)
 * Maps input values to output values using a lookup table
 *
 * @param value - The value to map
 * @param config - The transform configuration containing the value map
 * @returns Mapped value, default value, or original value
 */
export function applyMap(value: JsonValue, config: TransformConfig): JsonValue {
    // Guard: return original value if no mapping or null value
    if (config.values == null || value === null || value === undefined) {
        return value;
    }

    const stringValue = String(value);
    const key = config.caseSensitive === true ? stringValue : stringValue.toLowerCase();

    // Build case-insensitive lookup map only when needed
    const lookupMap = config.caseSensitive === true
        ? config.values
        : Object.fromEntries(
            Object.entries(config.values).map(([k, v]) => [k.toLowerCase(), v])
        );

    return lookupMap[key] ?? config.defaultValue ?? value;
}
