/**
 * Operator Factory
 *
 * Factory function to create simple data operators with reduced boilerplate.
 * This eliminates the duplicate pattern found in set, copy, rename, remove operators.
 *
 * Each of those operators had the same structure:
 * 1. Check if config is valid
 * 2. Map over records calling a helper function
 * 3. Return { records: results }
 *
 * @module operators/data
 */

import { JsonObject, OperatorHelpers, OperatorResult, BaseOperatorConfig, AdapterDefinition } from '../types';

/**
 * Type for a single-record transformation function
 */
export type RecordTransformFn<TConfig extends BaseOperatorConfig> = (
    record: JsonObject,
    config: TConfig,
) => JsonObject;

/**
 * Type for config validation function
 */
export type ConfigValidatorFn<TConfig extends BaseOperatorConfig> = (
    config: TConfig,
) => boolean;

/**
 * Creates a batch operator from a single-record transformation function.
 * This eliminates the repetitive pattern in simple data operators.
 *
 * @param transformFn - Function to transform a single record
 * @param isConfigValid - Optional function to validate config (default: always true)
 * @returns Batch operator function
 *
 * @example
 * // Before (duplicate pattern in each operator):
 * export function setOperator(
 *     records: readonly JsonObject[],
 *     config: SetOperatorConfig,
 *     _helpers: OperatorHelpers,
 * ): OperatorResult {
 *     const results = records.map(record => applySetOperator(record, config));
 *     return { records: results };
 * }
 *
 * // After (using factory):
 * export const setOperator = createSimpleOperator(
 *     applySetOperator,
 *     (config) => !!config.path,
 * );
 */
export function createSimpleOperator<TConfig extends BaseOperatorConfig>(
    transformFn: RecordTransformFn<TConfig>,
    isConfigValid?: ConfigValidatorFn<TConfig>,
): (records: readonly JsonObject[], config: TConfig, helpers: OperatorHelpers) => OperatorResult {
    return (
        records: readonly JsonObject[],
        config: TConfig,
        _helpers: OperatorHelpers,
    ): OperatorResult => {
        // Skip transformation if config is invalid
        if (isConfigValid && !isConfigValid(config)) {
            return { records: [...records] };
        }

        const results = records.map(record => transformFn(record, config));
        return { records: results };
    };
}

/**
 * Configuration for creating an operator definition
 */
export interface OperatorDefinitionConfig {
    code: string;
    description: string;
    pure?: boolean;
    fields: Array<{
        key: string;
        label: string;
        type: 'string' | 'json' | 'boolean' | 'number';
        required?: boolean;
        description?: string;
    }>;
}

/**
 * Creates an adapter definition for a data operator.
 * Reduces boilerplate for operator metadata.
 *
 * @param config - Operator definition configuration
 * @returns AdapterDefinition object
 */
export function createOperatorDefinition(config: OperatorDefinitionConfig): AdapterDefinition {
    return {
        type: 'operator',
        code: config.code,
        description: config.description,
        pure: config.pure ?? true,
        schema: {
            fields: config.fields,
        },
    };
}
