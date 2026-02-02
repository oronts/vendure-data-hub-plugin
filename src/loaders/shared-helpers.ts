/**
 * Shared Helper Functions for Loaders
 *
 * Common utilities used across multiple loader implementations.
 *
 * @module loaders
 */

import { ID, RequestContext, FacetValueService } from '@vendure/core';
import { slugify as canonicalSlugify } from '../operators/helpers';
import { isValidEmail } from '../utils/input-validation.utils';
import { DataHubLogger } from '../services/logger';

export const slugify = canonicalSlugify;

export { isValidEmail };

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
