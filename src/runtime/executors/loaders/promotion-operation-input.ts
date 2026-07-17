import type { ConfigurableOperationInput } from '@vendure/common/lib/generated-types';
import type { RecordObject } from '../../executor-types';

export interface ParsedPromotionOperations {
    readonly present: boolean;
    readonly operations?: ConfigurableOperationInput[];
}

function isConfigurableOperation(value: unknown): value is ConfigurableOperationInput {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const operation = value as { code?: unknown; arguments?: unknown };
    return typeof operation.code === 'string'
        && operation.code.trim().length > 0
        && Array.isArray(operation.arguments);
}

export function parsePromotionOperations(
    record: RecordObject,
    fieldName: string | undefined,
    label: 'conditions' | 'actions',
): ParsedPromotionOperations {
    if (!fieldName || !Object.prototype.hasOwnProperty.call(record, fieldName)) {
        return { present: false };
    }

    const value = record[fieldName];
    const parsed = typeof value === 'string' ? parseJsonArray(value, label) : value;
    if (!Array.isArray(parsed) || !parsed.every(isConfigurableOperation)) {
        throw new Error(
            `Promotion ${label} must be an array of operations with a non-empty code and arguments array`,
        );
    }

    return { present: true, operations: parsed };
}

function parseJsonArray(value: string, label: string): unknown {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        throw new Error(`Promotion ${label} must contain valid JSON`);
    }
}

export function requirePromotionActions(
    parsed: ParsedPromotionOperations,
): ConfigurableOperationInput[] {
    if (!parsed.present || !parsed.operations || parsed.operations.length === 0) {
        throw new Error('Promotion requires at least one action');
    }
    return parsed.operations;
}
