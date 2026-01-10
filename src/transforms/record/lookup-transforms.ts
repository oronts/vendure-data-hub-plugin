/**
 * Lookup Transforms
 *
 * Transform operations for looking up and mapping values.
 * Includes Vendure entity lookups and static value mapping.
 */

import { Logger } from '@nestjs/common';
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

const logger = new Logger('DataHub:LookupTransforms');

// VENDURE ENTITY MAPPING

/**
 * Map of entity types to their corresponding Vendure entity classes
 */
const ENTITY_CLASS_MAP: Record<string, any> = {
    Product,
    ProductVariant,
    Customer,
    Collection,
    Facet,
    FacetValue,
    Asset,
    CustomerGroup,
};

/**
 * Get Vendure entity class from type string
 */
export function getEntityClass(entityType: VendureEntityType): any {
    return ENTITY_CLASS_MAP[entityType] ?? null;
}

// LOOKUP FUNCTIONS

/**
 * Lookup value from Vendure entity
 * Queries database to find entity and returns specified field
 */
export async function vendureEntityLookup(
    ctx: RequestContext,
    value: JsonValue,
    entityType: VendureEntityType,
    fromField: string | undefined,
    toField: string | undefined,
    connection: TransactionalConnection,
): Promise<JsonValue> {
    const from = fromField ?? 'code';
    const to = toField ?? 'id';

    const entityClass = getEntityClass(entityType);
    if (!entityClass) return null;

    try {
        const repo = connection.getRepository(ctx, entityClass);
        const entity = await repo.findOne({ where: { [from]: value } as any });
        if (entity) {
            return (entity as any)[to] ?? null;
        }
    } catch (error) {
        logger.warn(`Lookup failed for ${entityType}.${from}=${value}: ${error}`);
    }

    return null;
}

/**
 * Perform lookup operation
 * Supports Vendure entity lookup and static value mapping
 */
export async function performLookup(
    ctx: RequestContext,
    value: JsonValue,
    config: TransformConfig,
    connection: TransactionalConnection,
): Promise<JsonValue> {
    if (value === null || value === undefined) return null;

    // Vendure entity lookup
    if (config.lookupType === 'VENDURE_ENTITY' && config.entityType) {
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
    if (config.values) {
        const key = String(value);
        return config.values[key] ?? config.defaultValue ?? null;
    }

    return value;
}

/**
 * Apply map transform (static value mapping)
 * Maps input values to output values using a lookup table
 */
export function applyMap(value: JsonValue, config: TransformConfig): JsonValue {
    if (config.values && value !== null && value !== undefined) {
        const key = config.caseSensitive ? String(value) : String(value).toLowerCase();
        const values = config.caseSensitive
            ? config.values
            : Object.fromEntries(Object.entries(config.values).map(([k, v]) => [k.toLowerCase(), v]));
        return values[key] ?? config.defaultValue ?? value;
    }
    return value;
}
