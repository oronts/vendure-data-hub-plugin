/**
 * Shared Helper Functions for Loaders
 *
 * Common utilities used across multiple loader implementations.
 *
 * @module loaders
 */

import { ID, RequestContext, FacetValueService, ProductVariantService } from '@vendure/core';
import { slugify as canonicalSlugify } from '../operators/helpers';
import { isValidEmail } from '../utils/input-validation.utils';
import { DataHubLogger } from '../services/logger';
import { RecordObject } from '../runtime/executor-types';
import { JsonValue } from '../types/index';

export const slugify = canonicalSlugify;

export { isValidEmail };

// =============================================================================
// Record Field Accessors
// =============================================================================

/**
 * Type guard to safely get a string value from a record.
 * Converts numbers and booleans to strings.
 *
 * @param record - The record object to extract the value from
 * @param key - The field name to extract
 * @returns String value or undefined if not present/convertible
 */
export function getStringValue(record: RecordObject, key: string): string | undefined {
    const value = record[key];
    if (typeof value === 'string') {
        return value || undefined;
    }
    if (value !== null && value !== undefined) {
        return String(value) || undefined;
    }
    return undefined;
}

/**
 * Type guard to safely get a number value from a record.
 * Parses string numbers.
 *
 * @param record - The record object to extract the value from
 * @param key - The field name to extract
 * @returns Number value or undefined if not present/convertible
 */
export function getNumberValue(record: RecordObject, key: string): number | undefined {
    const value = record[key];
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const num = Number(value);
        return Number.isNaN(num) ? undefined : num;
    }
    return undefined;
}

/**
 * Type guard to safely get an object value from a record.
 * Excludes arrays.
 *
 * @param record - The record object to extract the value from
 * @param key - The field name to extract
 * @returns Object value or undefined if not an object
 */
export function getObjectValue(record: RecordObject, key: string): Record<string, JsonValue> | undefined {
    const value = record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, JsonValue>;
    }
    return undefined;
}

/**
 * Safely get an ID value from a record (string or number).
 *
 * @param record - The record object to extract the value from
 * @param key - The field name to extract
 * @returns ID value or undefined if not present/valid
 */
export function getIdValue(record: RecordObject, key: string): ID | undefined {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') {
        return value;
    }
    return undefined;
}

/**
 * Safely extract an array value from a record by field name.
 *
 * @param record - The record object to extract the value from
 * @param key - The field name to extract
 * @returns Array value or undefined if not an array
 */
export function getArrayValue<T>(record: RecordObject, key: string): T[] | undefined {
    const value = record[key];
    if (!value || !Array.isArray(value)) {
        return undefined;
    }
    return value as T[];
}

/**
 * Determines if an error is recoverable (can be retried).
 * Checks for common transient error messages.
 */
export function isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('connection') ||
            message.includes('temporarily')
        );
    }
    return false;
}

/**
 * Determines if a field should be updated based on the updateOnlyFields list.
 * If no list is provided, all fields should be updated.
 */
export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}

/**
 * Input type for configurable operations
 */
export interface ConfigurableOperationInput {
    code: string;
    args?: Record<string, unknown>;
}

/**
 * Builds a configurable operation definition for Vendure
 * Converts user-friendly args format to Vendure's expected format
 */
export function buildConfigurableOperation(
    input: ConfigurableOperationInput,
): { code: string; arguments: Array<{ name: string; value: string }> } {
    return {
        code: input.code,
        arguments: Object.entries(input.args || {}).map(([name, value]) => ({
            name,
            value: typeof value === 'string' ? value : JSON.stringify(value),
        })),
    };
}

/**
 * Builds multiple configurable operations
 */
export function buildConfigurableOperations(
    inputs: ConfigurableOperationInput[],
): Array<{ code: string; arguments: Array<{ name: string; value: string }> }> {
    return inputs.map(input => buildConfigurableOperation(input));
}

/**
 * Find a product variant by SKU.
 * Returns a minimal object with just the ID for efficiency.
 *
 * @param productVariantService - The Vendure ProductVariantService
 * @param ctx - The request context
 * @param sku - The SKU to search for
 * @returns Object with variant ID if found, null otherwise
 */
export async function findVariantBySku(
    productVariantService: ProductVariantService,
    ctx: RequestContext,
    sku: string,
): Promise<{ id: ID } | null> {
    const result = await productVariantService.findAll(ctx, {
        filter: { sku: { eq: sku } },
        take: 1,
    });
    return result.items[0] ? { id: result.items[0].id } : null;
}

/**
 * Resolves facet value IDs from codes or names.
 * This is a shared utility used by ProductLoader and ProductVariantLoader.
 *
 * @param ctx - RequestContext
 * @param facetValueService - FacetValueService instance
 * @param codes - Array of facet value codes or names
 * @param logger - Logger instance for warnings
 * @returns Array of resolved facet value IDs
 */
export async function resolveFacetValueIds(
    ctx: RequestContext,
    facetValueService: FacetValueService,
    codes: string[],
    logger: DataHubLogger,
): Promise<ID[]> {
    if (!codes || codes.length === 0) {
        return [];
    }

    const ids: ID[] = [];
    const facetValues = await facetValueService.findAll(ctx.languageCode);

    // Build a map for efficient lookup (case-insensitive)
    const codeMap = new Map<string, ID>();
    const nameMap = new Map<string, ID>();
    for (const fv of facetValues) {
        codeMap.set(fv.code.toLowerCase(), fv.id);
        nameMap.set(fv.name.toLowerCase(), fv.id);
    }

    const notFoundCodes: string[] = [];

    for (const code of codes) {
        const normalizedCode = code.toLowerCase();
        const id = codeMap.get(normalizedCode) ?? nameMap.get(normalizedCode);
        if (id) {
            ids.push(id);
        } else {
            notFoundCodes.push(code);
        }
    }

    // Log all not-found codes at once to reduce log spam
    if (notFoundCodes.length > 0) {
        logger.warn(`Facet values not found: ${notFoundCodes.join(', ')}`);
    }

    return ids;
}
