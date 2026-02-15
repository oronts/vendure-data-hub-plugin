/**
 * Operator Types
 *
 * Types for transform operators in pipeline processing.
 * Comparison operators use lowercase/camelCase values (serialized to DB, changing requires migration).
 */

import { JsonValue, JsonObject } from './json.types';
import { HmacAlgorithm } from './trigger.types';

/**
 * Comparison operators for conditions and routing (canonical shared definition).
 *
 * Values are lowercase/camelCase (serialized to DB, changing requires migration).
 * Aligned with RouteConditionOperator enum in src/constants/enums.ts.
 *
 * @see src/operators/types.ts — extended ComparisonOperator (superset with negation/emptiness/between operators)
 */
export type ComparisonOperator =
    | 'eq' | 'ne'
    | 'gt' | 'lt' | 'gte' | 'lte'
    | 'in' | 'notIn'
    | 'contains' | 'notContains'
    | 'startsWith' | 'endsWith'
    | 'matches' | 'regex'
    | 'exists'
    | 'isNull';

/**
 * Condition for operator-based filtering or routing
 */
export interface OperatorCondition {
    /** Field path to evaluate */
    field: string;
    /** Comparison operator (defaults to 'eq' if not specified) */
    operator?: ComparisonOperator;
    /** Alias for operator (for compatibility with pipeline DSL and schema examples) */
    cmp?: ComparisonOperator;
    /** Value to compare against */
    value?: JsonValue;
    /** Whether string comparisons should be case-insensitive */
    caseInsensitive?: boolean;
}

/**
 * Error that occurred during operator execution
 *
 * @see src/sdk/types/result-types.ts OperatorError for the SDK/adapter-facing version
 */
export interface OperatorError {
    /** Human-readable error message */
    message: string;
    /** Field that caused the error */
    field?: string;
    /** Index of the record that caused the error */
    index?: number;
    /** The record that caused the error */
    record?: JsonObject;
    /** Underlying cause if this wraps another error */
    cause?: Error;
}

/**
 * Result of operator execution on a batch of records
 */
export interface OperatorResult {
    /** Processed output records */
    records: JsonObject[];
    /** Number of records dropped by filtering */
    dropped?: number;
    /** Errors encountered during processing */
    errors?: OperatorError[];
    /** Additional metadata about the operation */
    meta?: JsonObject;
}

/**
 * Base configuration shared by all operators
 */
export interface BaseOperatorConfig {
    /** Skip records with null values in source fields */
    skipNull?: boolean;
    /** Fail entire batch if any record fails (default: false, skip errors) */
    failOnError?: boolean;
}

/**
 * Configuration for field path-based operators
 */
export interface FieldPathConfig extends BaseOperatorConfig {
    /** Source field path */
    source?: string;
    /** Target field path for output */
    target?: string;
    /** Alternative path parameter (some operators use 'path' instead of source/target) */
    path?: string;
}

/**
 * Function signature for operators that process one record at a time
 * @returns Transformed record, or null to drop the record
 */
export type SingleRecordOperatorFn<TConfig = JsonObject> = (
    record: JsonObject,
    config: TConfig,
    helpers: OperatorHelpers,
) => Promise<JsonObject | null> | JsonObject | null;

/**
 * Function signature for operators that process entire batches
 * @returns Result containing processed records and metadata
 */
export type BatchOperatorFn<TConfig = JsonObject> = (
    records: readonly JsonObject[],
    config: TConfig,
    helpers: OperatorHelpers,
) => Promise<OperatorResult> | OperatorResult;

/**
 * Interface for resolving secrets from the secret store
 */
export interface SecretResolver {
    /** Get a secret by code, returns undefined if not found */
    get(code: string): Promise<string | undefined>;
    /** Get a secret by code, throws if not found */
    getRequired(code: string): Promise<string>;
}

/**
 * Interface for resolving connection configurations
 */
export interface ConnectionResolver {
    /** Get a connection config by code, returns undefined if not found */
    get<T = JsonObject>(code: string): Promise<T | undefined>;
    /** Get a connection config by code, throws if not found */
    getRequired<T = JsonObject>(code: string): Promise<T>;
}

/**
 * Logger interface for adapter/operator logging
 */
export interface AdapterLogger {
    /** Log debug-level message */
    debug(message: string, meta?: JsonObject): void;
    /** Log info-level message */
    info(message: string, meta?: JsonObject): void;
    /** Log warning-level message */
    warn(message: string, meta?: JsonObject): void;
    /** Log error-level message */
    error(message: string, errorOrMeta?: Error | JsonObject, meta?: JsonObject): void;
}

/**
 * Helper functions for formatting values
 */
export interface FormatHelpers {
    /** Format a date using the specified format string */
    formatDate(date: Date | string | number, format: string): string;
    /** Parse a date string, optionally with a specific format */
    parseDate(value: string, format?: string): Date | null;
    /** Format a number with locale-aware formatting */
    formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
    /** Format a number as currency */
    formatCurrency(value: number, currency?: string): string;
}

/**
 * Helper functions for type conversion
 */
export interface ConversionHelpers {
    /** Convert value to number, returns null if not convertible */
    toNumber(value: JsonValue): number | null;
    /** Convert value to string */
    toString(value: JsonValue): string;
    /** Convert value to boolean */
    toBoolean(value: JsonValue): boolean;
    /** Convert value to array */
    toArray<T = JsonValue>(value: JsonValue): T[];
    /** Convert value to Date, returns null if not convertible */
    toDate(value: JsonValue): Date | null;
}

/**
 * Helper functions for cryptographic operations
 */
export interface CryptoHelpers {
    /** Compute MD5 hash of a string */
    md5(value: string): string;
    /** Compute SHA-256 hash of a string */
    sha256(value: string): string;
    /** Compute HMAC signature */
    hmac(value: string, key: string, algorithm?: HmacAlgorithm): string;
    /** Generate a new UUID v4 */
    uuid(): string;
}

/**
 * Helper utilities provided to operators during execution
 */
export interface OperatorHelpers {
    /** Secret resolver for accessing secrets */
    secrets?: SecretResolver;
    /** Connection resolver for accessing connection configs */
    connections?: ConnectionResolver;
    /** Logger for operator logging */
    logger?: AdapterLogger;
    /** Formatting helper functions */
    format: FormatHelpers;
    /** Type conversion helper functions */
    convert: ConversionHelpers;
    /** Cryptographic helper functions */
    crypto: CryptoHelpers;
    /** Get a nested value from an object using dot notation */
    getNestedValue(obj: JsonObject, path: string): JsonValue | undefined;
    /** Set a nested value in an object using dot notation */
    setNestedValue(obj: JsonObject, path: string, value: JsonValue): void;
    /** Deep clone an object */
    deepClone<T>(obj: T): T;
}
