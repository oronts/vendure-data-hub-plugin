import type { ID } from '@vendure/common/lib/shared-types';
import type { ProductVariantService, RequestContext } from '@vendure/core';
import type { RecordObject } from '../runtime/executor-types';
import type { JsonValue } from '../types';
import { getNestedValue } from '../utils/object-path.utils';

function getRecordValue(record: RecordObject, key: string): unknown {
    return key.includes('.')
        ? getNestedValue(record as Record<string, unknown>, key)
        : record[key];
}

export function createChannelScopedCacheKey(
    ctx: RequestContext,
    value: string,
): string {
    return JSON.stringify([String(ctx.channelId), value]);
}

export function getStringValue(record: RecordObject, key: string): string | undefined {
    const value = getRecordValue(record, key);
    if (typeof value === 'string') {
        return value || undefined;
    }
    if (value != null) {
        return String(value) || undefined;
    }
    return undefined;
}

export function getNumberValue(record: RecordObject, key: string): number | undefined {
    const value = getRecordValue(record, key);
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const numberValue = Number(value);
        return Number.isNaN(numberValue) ? undefined : numberValue;
    }
    return undefined;
}

export function getObjectValue(
    record: RecordObject,
    key: string,
): Record<string, JsonValue> | undefined {
    const value = getRecordValue(record, key);
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, JsonValue>
        : undefined;
}

export function getIdValue(record: RecordObject, key: string): ID | undefined {
    const value = getRecordValue(record, key);
    return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

export function getArrayValue<T>(record: RecordObject, key: string): T[] | undefined {
    const value = getRecordValue(record, key);
    return Array.isArray(value) ? value as T[] : undefined;
}

export function shouldUpdateField(field: string, updateOnlyFields?: string[]): boolean {
    return !updateOnlyFields || updateOnlyFields.length === 0 || updateOnlyFields.includes(field);
}

export interface ConfigurableOperationInput {
    code: string;
    args?: Record<string, unknown>;
}

export interface ConfigurableOperation {
    code: string;
    arguments: Array<{ name: string; value: string }>;
}

function serializeConfigArgument(name: string, value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
        throw new Error(`Configurable operation argument "${name}" is not JSON-serializable`);
    }
    return serialized;
}

export function buildConfigurableOperation(input: ConfigurableOperationInput): ConfigurableOperation {
    return {
        code: input.code,
        arguments: Object.entries(input.args ?? {}).map(([name, value]) => ({
            name,
            value: serializeConfigArgument(name, value),
        })),
    };
}

export function buildConfigurableOperations(
    inputs: ConfigurableOperationInput[],
): ConfigurableOperation[] {
    return inputs.map(buildConfigurableOperation);
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
