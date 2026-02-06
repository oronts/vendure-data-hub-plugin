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

export function getObjectValue(record: RecordObject, key: string): Record<string, JsonValue> | undefined {
    const value = record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, JsonValue>;
    }
    return undefined;
}

export function getIdValue(record: RecordObject, key: string): ID | undefined {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') {
        return value;
    }
    return undefined;
}

export function getArrayValue<T>(record: RecordObject, key: string): T[] | undefined {
    const value = record[key];
    if (!value || !Array.isArray(value)) {
        return undefined;
    }
    return value as T[];
}

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

export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}

export interface ConfigurableOperationInput {
    code: string;
    args?: Record<string, unknown>;
}

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

export function buildConfigurableOperations(
    inputs: ConfigurableOperationInput[],
): Array<{ code: string; arguments: Array<{ name: string; value: string }> }> {
    return inputs.map(input => buildConfigurableOperation(input));
}

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
