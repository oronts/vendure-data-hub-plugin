/**
 * Multi-Source Join Operator
 *
 * Merges records from two datasets by matching on key fields.
 * Supports INNER, LEFT, RIGHT, and FULL OUTER join types.
 *
 * The right-side dataset is provided inline via `rightData`.
 */

import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { getNestedValue, deepClone } from '../helpers';
import { MultiJoinOperatorConfig } from './types';
import { OPERATOR_LIMITS } from '../../constants/defaults/runtime-defaults';

export const MULTI_JOIN_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'multiJoin',
    description:
        'Join two datasets by matching key fields. Supports INNER, LEFT, RIGHT, and FULL OUTER join types.',
    category: 'AGGREGATION',
    categoryLabel: 'Aggregation',
    categoryOrder: 6,
    pure: false, // Creates/removes records based on join type
    schema: {
        fields: [
            { key: 'leftKey', label: 'Left key field', type: 'string', required: true, description: 'Field path in left (primary) records to join on' },
            { key: 'rightKey', label: 'Right key field', type: 'string', required: true, description: 'Field path in right records to join on' },
            {
                key: 'type', label: 'Join type', type: 'select', defaultValue: 'LEFT',
                options: [
                    { value: 'INNER', label: 'Inner (only matches)' },
                    { value: 'LEFT', label: 'Left (all left, match right)' },
                    { value: 'RIGHT', label: 'Right (all right, match left)' },
                    { value: 'FULL', label: 'Full outer (all from both)' },
                ],
            },
            {
                key: 'rightData',
                label: 'Right dataset',
                type: 'json',
                required: true,
                description: `Static array of right-side records (maximum ${OPERATOR_LIMITS.MAX_MULTI_JOIN_RIGHT_RECORDS.toLocaleString()})`,
                validation: {
                    maxLength: OPERATOR_LIMITS.MAX_MULTI_JOIN_RIGHT_RECORDS,
                },
            },
            { key: 'prefix', label: 'Right field prefix', type: 'string', description: 'Prefix for right-side field names to avoid collisions' },
            { key: 'select', label: 'Select right fields', type: 'json', description: 'Array of right-side field names to include (default: all)' },
            {
                key: 'maxOutputRecords',
                label: 'Maximum output records',
                type: 'number',
                defaultValue: OPERATOR_LIMITS.DEFAULT_MULTI_JOIN_OUTPUT_RECORDS,
                description: 'Fail the join before its output exceeds this record count',
                validation: {
                    min: 1,
                    max: OPERATOR_LIMITS.MAX_MULTI_JOIN_OUTPUT_RECORDS,
                },
            },
        ],
    },
};

/**
 * Resolve the right-side dataset from config or helpers context.
 */
function resolveRightData(
    config: MultiJoinOperatorConfig,
): JsonObject[] {
    const rightData: unknown = config.rightData;

    if (!Array.isArray(rightData)) {
        throw new Error('multiJoin rightData must be an array');
    }
    if (rightData.length > OPERATOR_LIMITS.MAX_MULTI_JOIN_RIGHT_RECORDS) {
        throw new Error(
            `multiJoin rightData exceeds the maximum of ${OPERATOR_LIMITS.MAX_MULTI_JOIN_RIGHT_RECORDS} records`,
        );
    }

    for (const [index, record] of rightData.entries()) {
        if (record === null || typeof record !== 'object' || Array.isArray(record)) {
            throw new Error(`multiJoin rightData[${index}] must be an object`);
        }
    }

    return rightData as JsonObject[];
}

function resolveOutputLimit(value: unknown): number {
    const limit = value ?? OPERATOR_LIMITS.DEFAULT_MULTI_JOIN_OUTPUT_RECORDS;
    if (
        typeof limit !== 'number'
        || !Number.isInteger(limit)
        || limit < 1
        || limit > OPERATOR_LIMITS.MAX_MULTI_JOIN_OUTPUT_RECORDS
    ) {
        throw new Error(
            `multiJoin maxOutputRecords must be an integer between 1 and ${OPERATOR_LIMITS.MAX_MULTI_JOIN_OUTPUT_RECORDS}`,
        );
    }
    return limit;
}

type ResolvedJoinType = NonNullable<MultiJoinOperatorConfig['type']>;

function resolveJoinType(value: unknown): ResolvedJoinType {
    const joinType = value ?? 'LEFT';
    if (
        joinType !== 'INNER'
        && joinType !== 'LEFT'
        && joinType !== 'RIGHT'
        && joinType !== 'FULL'
    ) {
        throw new Error('multiJoin type must be INNER, LEFT, RIGHT, or FULL');
    }
    return joinType;
}

function requireKeyPath(value: unknown, name: 'leftKey' | 'rightKey'): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`multiJoin ${name} must be a non-empty string`);
    }
    return value;
}

function resolveSelect(value: unknown): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || value.some(field => typeof field !== 'string')) {
        throw new Error('multiJoin select must be an array of field names');
    }
    return value;
}

function getRightFieldPrefix(prefix: string | undefined): string {
    if (!prefix) return '';
    return prefix.endsWith('_') ? prefix : `${prefix}_`;
}

/**
 * Build an index of right-side records keyed by the join key value.
 * Multiple records can share the same key (one-to-many).
 */
function normalizeJoinKey(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return `string:${value}`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return `number:${value}`;
    }
    if (typeof value === 'boolean') {
        return `boolean:${value}`;
    }
    return undefined;
}

interface RightRecordIndex {
    readonly recordsByKey: Map<string, IndexedRightRecord[]>;
}

interface IndexedRightRecord {
    readonly index: number;
    readonly record: JsonObject;
}

function buildIndex(records: JsonObject[], keyPath: string): RightRecordIndex {
    const recordsByKey = new Map<string, IndexedRightRecord[]>();

    for (const [index, record] of records.entries()) {
        const key = normalizeJoinKey(getNestedValue(record, keyPath));
        if (key === undefined) {
            continue;
        }
        const existing = recordsByKey.get(key);
        if (existing) {
            existing.push({ index, record });
        } else {
            recordsByKey.set(key, [{ index, record }]);
        }
    }

    return { recordsByKey };
}

function collectFieldNames(
    records: readonly JsonObject[],
    select?: readonly string[],
): string[] {
    if (select && select.length > 0) {
        return [...new Set(select)];
    }
    const fields = new Set<string>();
    for (const record of records) {
        for (const field of Object.keys(record)) {
            fields.add(field);
        }
    }
    return [...fields];
}

function appendResult(
    results: JsonObject[],
    record: JsonObject,
    maxOutputRecords: number,
): void {
    if (results.length >= maxOutputRecords) {
        throw new Error(
            `multiJoin output exceeds maxOutputRecords (${maxOutputRecords})`,
        );
    }
    results.push(record);
}

/**
 * Merge right-side fields into a left record.
 * Applies prefix and select filtering if configured.
 */
function mergeRecords(
    left: JsonObject,
    right: JsonObject,
    prefix: string | undefined,
    rightFieldNames: readonly string[],
): JsonObject {
    const result = deepClone(left);
    const rightClone = deepClone(right);
    const fieldPrefix = getRightFieldPrefix(prefix);

    for (const key of rightFieldNames) {
        const targetKey = `${fieldPrefix}${key}`;
        (result as Record<string, unknown>)[targetKey] = key in rightClone
            ? rightClone[key]
            : null;
    }

    return result;
}

/**
 * Create a record with null values for right-side fields.
 * Used when a left record has no match in LEFT or FULL joins.
 */
function mergeWithNullRight(
    left: JsonObject,
    prefix: string | undefined,
    rightFieldNames: readonly string[],
): JsonObject {
    const result = deepClone(left);
    const fieldPrefix = getRightFieldPrefix(prefix);

    for (const key of rightFieldNames) {
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
    right: JsonObject,
    prefix: string | undefined,
    leftFieldNames: readonly string[],
    rightFieldNames: readonly string[],
): JsonObject {
    const result: JsonObject = {};

    for (const key of leftFieldNames) {
        (result as Record<string, unknown>)[key] = null;
    }

    const rightClone = deepClone(right);
    const fieldPrefix = getRightFieldPrefix(prefix);

    for (const key of rightFieldNames) {
        const targetKey = `${fieldPrefix}${key}`;
        (result as Record<string, unknown>)[targetKey] = key in rightClone
            ? rightClone[key]
            : null;
    }

    return result;
}

export function multiJoinOperator(
    records: readonly JsonObject[],
    config: MultiJoinOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    const leftKeyPath = requireKeyPath(config.leftKey, 'leftKey');
    const rightKeyPath = requireKeyPath(config.rightKey, 'rightKey');
    const joinType = resolveJoinType(config.type);
    const select = resolveSelect(config.select);
    const rightData = resolveRightData(config);
    const maxOutputRecords = resolveOutputLimit(config.maxOutputRecords);

    if (rightData.length === 0 && (joinType === 'INNER' || joinType === 'RIGHT')) {
        // INNER with no right data => no results; RIGHT with no right data => no results
        return { records: [] };
    }

    if (rightData.length === 0) {
        // LEFT or FULL with no right data => return left records as-is
        if (records.length > maxOutputRecords) {
            throw new Error(
                `multiJoin output exceeds maxOutputRecords (${maxOutputRecords})`,
            );
        }
        return { records: [...records] };
    }

    const { recordsByKey } = buildIndex(rightData, rightKeyPath);
    const results: JsonObject[] = [];

    const matchedRightIndexes = new Set<number>();
    const rightFieldNames = collectFieldNames(rightData, select);
    const leftFieldNames = collectFieldNames(records);

    // Process left records
    for (const leftRecord of records) {
        const leftKey = normalizeJoinKey(getNestedValue(leftRecord, leftKeyPath));
        const matchingRight = leftKey === undefined
            ? undefined
            : recordsByKey.get(leftKey);

        if (matchingRight && matchingRight.length > 0) {
            // Emit one result per matching right record
            for (const { index, record: rightRecord } of matchingRight) {
                matchedRightIndexes.add(index);
                appendResult(
                    results,
                    mergeRecords(leftRecord, rightRecord, config.prefix, rightFieldNames),
                    maxOutputRecords,
                );
            }
        } else if (joinType === 'LEFT' || joinType === 'FULL') {
            // No match - include left with null right fields
            appendResult(
                results,
                mergeWithNullRight(leftRecord, config.prefix, rightFieldNames),
                maxOutputRecords,
            );
        }
        // INNER and RIGHT: skip unmatched left records
    }

    // For RIGHT and FULL joins, include unmatched right records
    if (joinType === 'RIGHT' || joinType === 'FULL') {
        for (const [index, rightRecord] of rightData.entries()) {
            if (matchedRightIndexes.has(index)) {
                continue;
            }
            appendResult(
                results,
                mergeWithNullLeft(
                    rightRecord,
                    config.prefix,
                    leftFieldNames,
                    rightFieldNames,
                ),
                maxOutputRecords,
            );
        }
    }

    return { records: results };
}
