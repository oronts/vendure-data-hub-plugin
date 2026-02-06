/**
 * Operator Factory
 *
 * Provides factory functions to reduce boilerplate when creating record-based operators.
 * This eliminates the duplicated wrapper pattern seen in set, copy, rename, map, and remove operators.
 */

import { JsonObject, OperatorHelpers, OperatorResult } from '../types';

/**
 * Creates a record operator that applies a transform function to each record.
 *
 * This factory eliminates the common pattern:
 * ```typescript
 * export function someOperator(
 *     records: readonly JsonObject[],
 *     config: SomeConfig,
 *     _helpers: OperatorHelpers,
 * ): OperatorResult {
 *     const results = records.map(record => applySomeOperator(record, config));
 *     return { records: results };
 * }
 * ```
 *
 * Usage:
 * ```typescript
 * export const someOperator = createRecordOperator(applySomeOperator);
 * ```
 *
 * @param applyFn - Function that transforms a single record given the config
 * @returns An operator function that applies the transform to all records
 */
export function createRecordOperator<TConfig>(
    applyFn: (record: JsonObject, config: TConfig) => JsonObject,
): (records: readonly JsonObject[], config: TConfig, helpers: OperatorHelpers) => OperatorResult {
    return (records, config, _helpers) => ({
        records: records.map(record => applyFn(record, config)),
    });
}

/**
 * Creates a record operator with access to helpers (e.g., for logging or context).
 *
 * Use this when the single-record transform needs access to operator helpers.
 *
 * @param applyFn - Function that transforms a single record given the config and helpers
 * @returns An operator function that applies the transform to all records
 */
export function createRecordOperatorWithHelpers<TConfig>(
    applyFn: (record: JsonObject, config: TConfig, helpers: OperatorHelpers) => JsonObject,
): (records: readonly JsonObject[], config: TConfig, helpers: OperatorHelpers) => OperatorResult {
    return (records, config, helpers) => ({
        records: records.map(record => applyFn(record, config, helpers)),
    });
}
