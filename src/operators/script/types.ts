/**
 * Script Operator Types
 *
 * Types for inline JavaScript execution in transformations.
 */

import { JsonObject } from '../../types';

/**
 * Configuration for the script operator
 *
 * Allows inline JavaScript code to transform records.
 * The code receives `record` (current record) and `index` (record index).
 * Must return the transformed record or null to filter out.
 */
export interface ScriptOperatorConfig {
    /**
     * JavaScript code that transforms a single record.
     * Receives: record (JsonObject), index (number), context (object)
     * Must return: transformed record or null to filter out
     *
     * @example
     * // Add computed field
     * "return { ...record, total: record.price * record.quantity }"
     *
     * @example
     * // Filter records
     * "return record.status === 'active' ? record : null"
     *
     * @example
     * // Complex transformation
     * "const { name, ...rest } = record; return { ...rest, fullName: name.toUpperCase() }"
     */
    code: string;

    /**
     * If true, the code receives and returns the entire records array
     * instead of processing one record at a time.
     * Use for aggregations or cross-record operations.
     *
     * When true, code receives: records (JsonObject[]), context (object)
     * Must return: transformed records array
     *
     * @example
     * // Sort records
     * "return records.sort((a, b) => a.price - b.price)"
     *
     * @example
     * // Add running total
     * "let total = 0; return records.map(r => ({ ...r, runningTotal: total += r.amount }))"
     */
    batch?: boolean;

    /**
     * Timeout in milliseconds (default: 5000)
     */
    timeout?: number;

    /**
     * If true, errors will cause the entire step to fail.
     * If false (default), failed records are logged and skipped.
     */
    failOnError?: boolean;

    /**
     * Optional context data passed to the script
     */
    context?: JsonObject;
}

/**
 * Execution context available to script code
 */
export interface ScriptContext {
    /** Current record index (for single-record mode) */
    index?: number;
    /** Total number of records */
    total: number;
    /** Pipeline ID */
    pipelineId?: string;
    /** Run ID */
    runId?: string;
    /** Additional context data from config */
    data?: JsonObject;
}
