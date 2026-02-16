/**
 * Multi-Source Join Operator
 *
 * Merges records from two datasets by matching on key fields.
 * Supports INNER, LEFT, RIGHT, and FULL OUTER join types.
 *
 * The right-side dataset can be provided either:
 * - Inline via `rightData` (static array of records)
 * - From pipeline context via `rightDataPath` (dot-path to an array in the helpers context)
 */

import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { getNestedValue, deepClone } from '../helpers';
import { MultiJoinOperatorConfig } from './types';

export const MULTI_JOIN_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'multiJoin',
    description:
        'Join two datasets by matching key fields. Supports INNER, LEFT, RIGHT, and FULL OUTER join types.',
    pure: false, // Creates/removes records based on join type
    schema: {
        fields: [
            { key: 'leftKey', label: 'Left key field', type: 'string', required: true, description: 'Field path in left (primary) records to join on' },
            { key: 'rightKey', label: 'Right key field', type: 'string', required: true, description: 'Field path in right records to join on' },
            {
                key: 'type', label: 'Join type', type: 'select', required: true,
                options: [
                    { value: 'INNER', label: 'Inner (only matches)' },
                    { value: 'LEFT', label: 'Left (all left, match right)' },
                    { value: 'RIGHT', label: 'Right (all right, match left)' },
                    { value: 'FULL', label: 'Full outer (all from both)' },
                ],
            },
            { key: 'rightData', label: 'Right dataset (inline)', type: 'json', description: 'Static array of right-side records' },
            { key: 'rightDataPath', label: 'Right dataset path', type: 'string', description: 'Dot-path to right-side data in pipeline context' },
            { key: 'prefix', label: 'Right field prefix', type: 'string', description: 'Prefix for right-side field names to avoid collisions' },
            { key: 'select', label: 'Select right fields', type: 'json', description: 'Array of right-side field names to include (default: all)' },
        ],
    },
};

/**
 * Resolve the right-side dataset from config or helpers context.
 */
function resolveRightData(
    config: MultiJoinOperatorConfig,
    helpers: AdapterOperatorHelpers,
): JsonObject[] {
    if (config.rightData && Array.isArray(config.rightData) && config.rightData.length > 0) {
        return config.rightData;
    }

    if (config.rightDataPath) {
        const ctx = helpers.ctx as unknown as JsonObject | undefined;
        if (ctx) {
            const resolved = getNestedValue(ctx, config.rightDataPath);
            if (Array.isArray(resolved)) {
                return resolved as JsonObject[];
            }
        }
    }

    return [];
}

/**
 * Build an index of right-side records keyed by the join key value.
 * Multiple records can share the same key (one-to-many).
 */
function buildIndex(records: JsonObject[], keyPath: string): Map<string, JsonObject[]> {
    const index = new Map<string, JsonObject[]>();

    for (const record of records) {
        const keyValue = getNestedValue(record, keyPath);
        const key = keyValue == null ? '' : String(keyValue);
        const existing = index.get(key);
        if (existing) {
            existing.push(record);
        } else {
            index.set(key, [record]);
        }
    }

    return index;
}

/**
 * Merge right-side fields into a left record.
 * Applies prefix and select filtering if configured.
 */
function mergeRecords(
    left: JsonObject,
    right: JsonObject | null,
    prefix: string | undefined,
    select: string[] | undefined,
): JsonObject {
    const result = deepClone(left);

    if (!right) {
        return result;
    }

    const rightClone = deepClone(right);
    const fieldPrefix = prefix ? `${prefix}_` : '';
    const entries = Object.entries(rightClone);

    for (const [key, value] of entries) {
        // If select is specified, skip fields not in the list
        if (select && select.length > 0 && !select.includes(key)) {
            continue;
        }
        const targetKey = `${fieldPrefix}${key}`;
        (result as Record<string, unknown>)[targetKey] = value;
    }

    return result;
}

/**
 * Create a record with null values for right-side fields.
 * Used when a left record has no match in LEFT or FULL joins.
 */
function mergeWithNullRight(
    left: JsonObject,
    rightSample: JsonObject | undefined,
    prefix: string | undefined,
    select: string[] | undefined,
): JsonObject {
    const result = deepClone(left);

    if (!rightSample) {
        return result;
    }

    const fieldPrefix = prefix ? `${prefix}_` : '';
    const keys = Object.keys(rightSample);

    for (const key of keys) {
        if (select && select.length > 0 && !select.includes(key)) {
            continue;
        }
        const targetKey = `${fieldPrefix}${key}`;
        (result as Record<string, unknown>)[targetKey] = null;
    }

    return result;
}

/**
 * Create a record from a right-side record with null left-side fields.
 * Used when a right record has no match in RIGHT or FULL joins.
 */
function mergeWithNullLeft(
    leftSample: JsonObject | undefined,
    right: JsonObject,
    prefix: string | undefined,
    select: string[] | undefined,
): JsonObject {
    const result: JsonObject = {};

    // Fill left-side fields with null
    if (leftSample) {
        for (const key of Object.keys(leftSample)) {
            (result as Record<string, unknown>)[key] = null;
        }
    }

    // Merge right-side fields
    const rightClone = deepClone(right);
    const fieldPrefix = prefix ? `${prefix}_` : '';

    for (const [key, value] of Object.entries(rightClone)) {
        if (select && select.length > 0 && !select.includes(key)) {
            continue;
        }
        const targetKey = `${fieldPrefix}${key}`;
        (result as Record<string, unknown>)[targetKey] = value;
    }

    return result;
}

export function multiJoinOperator(
    records: readonly JsonObject[],
    config: MultiJoinOperatorConfig,
    helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.leftKey || !config.rightKey) {
        return { records: [...records] };
    }

    const joinType = config.type ?? 'LEFT';
    const rightData = resolveRightData(config, helpers);

    if (rightData.length === 0 && (joinType === 'INNER' || joinType === 'RIGHT')) {
        // INNER with no right data => no results; RIGHT with no right data => no results
        return { records: [] };
    }

    if (rightData.length === 0) {
        // LEFT or FULL with no right data => return left records as-is
        return { records: [...records] };
    }

    const rightIndex = buildIndex(rightData, config.rightKey);
    const results: JsonObject[] = [];

    // Track which right keys have been matched (for RIGHT and FULL joins)
    const matchedRightKeys = new Set<string>();

    // Get a sample right record for null-filling
    const rightSample = rightData.length > 0 ? rightData[0] : undefined;
    const leftSample = records.length > 0 ? records[0] : undefined;

    // Process left records
    for (const leftRecord of records) {
        const leftKeyValue = getNestedValue(leftRecord, config.leftKey);
        const leftKey = leftKeyValue == null ? '' : String(leftKeyValue);
        const matchingRight = rightIndex.get(leftKey);

        if (matchingRight && matchingRight.length > 0) {
            matchedRightKeys.add(leftKey);
            // Emit one result per matching right record
            for (const rightRecord of matchingRight) {
                results.push(
                    mergeRecords(leftRecord, rightRecord, config.prefix, config.select),
                );
            }
        } else if (joinType === 'LEFT' || joinType === 'FULL') {
            // No match - include left with null right fields
            results.push(
                mergeWithNullRight(leftRecord, rightSample, config.prefix, config.select),
            );
        }
        // INNER and RIGHT: skip unmatched left records
    }

    // For RIGHT and FULL joins, include unmatched right records
    if (joinType === 'RIGHT' || joinType === 'FULL') {
        for (const [rightKey, rightRecords] of rightIndex) {
            if (!matchedRightKeys.has(rightKey)) {
                for (const rightRecord of rightRecords) {
                    results.push(
                        mergeWithNullLeft(leftSample, rightRecord, config.prefix, config.select),
                    );
                }
            }
        }
    }

    return { records: results };
}
