/**
 * Transform Types - SDK types for data transformation and operators
 *
 * These types define helper interfaces for transforming records,
 * including lookup functions, formatting, and data conversion.
 *
 * @module sdk/types/transform-types
 */

import { JsonValue, JsonObject } from '../../types/index';
import { OperatorContext } from './adapter-types';

// LOOKUP TYPES

/**
 * Vendure entities available for lookup
 */
export type LookupEntity =
    | 'product'
    | 'variant'
    | 'customer'
    | 'collection'
    | 'facet'
    | 'facetValue'
    | 'asset'
    | 'order'
    | 'promotion'
    | 'channel'
    | 'taxCategory';

// FORMAT HELPERS

/**
 * Formatting helper functions
 */
export interface FormatHelpers {
    /**
     * Format a monetary amount
     * @param amount Amount in major units
     * @param currencyCode ISO currency code
     * @param locale Optional locale for formatting
     * @returns Formatted currency string
     */
    currency(amount: number, currencyCode: string, locale?: string): string;

    /**
     * Format a date
     * @param date Date to format
     * @param format Format string (e.g., 'YYYY-MM-DD')
     * @returns Formatted date string
     */
    date(date: Date | string | number, format: string): string;

    /**
     * Format a number
     * @param value Number to format
     * @param decimals Decimal places
     * @param locale Optional locale for formatting
     * @returns Formatted number string
     */
    number(value: number, decimals?: number, locale?: string): string;

    /**
     * Render a template string with data
     * @param template Template with placeholders (e.g., '{{name}} - {{sku}}')
     * @param data Data to interpolate
     * @returns Rendered string
     */
    template(template: string, data: JsonObject): string;
}

// CONVERSION HELPERS

/**
 * Unit type literals for conversion
 */
export type UnitType =
    // Weight units
    | 'g' | 'kg' | 'lb' | 'oz'
    // Length units
    | 'cm' | 'm' | 'mm' | 'in' | 'ft'
    // Volume units
    | 'ml' | 'l' | 'gal'
    // Temperature units
    | 'c' | 'f' | 'k';

/**
 * Conversion helper functions
 */
export interface ConversionHelpers {
    /**
     * Convert amount to minor units (e.g., cents)
     * @param amount Amount in major units
     * @param decimals Decimal places (default: 2)
     * @returns Amount in minor units
     */
    toMinorUnits(amount: number, decimals?: number): number;

    /**
     * Convert amount from minor units (e.g., cents)
     * @param amount Amount in minor units
     * @param decimals Decimal places (default: 2)
     * @returns Amount in major units
     */
    fromMinorUnits(amount: number, decimals?: number): number;

    /**
     * Convert between measurement units
     * @param value Value to convert
     * @param from Source unit
     * @param to Target unit
     * @returns Converted value
     */
    unit(value: number, from: UnitType, to: UnitType): number;

    /**
     * Parse a date string
     * @param value Date string to parse
     * @param format Optional format hint
     * @returns Parsed Date or null if invalid
     */
    parseDate(value: string, format?: string): Date | null;
}

// CRYPTO HELPERS

/**
 * Cryptographic helper functions
 */
export interface CryptoHelpers {
    /**
     * Generate a hash of a value
     * @param value Value to hash
     * @param algorithm Hash algorithm
     * @returns Hex-encoded hash
     */
    hash(value: string, algorithm?: 'md5' | 'sha256' | 'sha512'): string;

    /**
     * Generate an HMAC signature
     * @param value Value to sign
     * @param secret Secret key
     * @param algorithm Hash algorithm
     * @returns Hex-encoded HMAC
     */
    hmac(value: string, secret: string, algorithm?: 'sha256' | 'sha512'): string;

    /**
     * Generate a UUID v4
     * @returns UUID string
     */
    uuid(): string;
}

// OPERATOR HELPERS

/**
 * Complete helper object provided to operator adapters
 */
export interface OperatorHelpers {
    /** Operator context */
    readonly ctx: OperatorContext;

    /**
     * Get a value from a record using dot notation path
     * @param record Source record
     * @param path Dot notation path (e.g., 'product.name')
     * @returns Value at path or undefined
     */
    get(record: JsonObject, path: string): JsonValue | undefined;

    /**
     * Set a value in a record using dot notation path
     * @param record Target record (mutated)
     * @param path Dot notation path
     * @param value Value to set
     */
    set(record: JsonObject, path: string, value: JsonValue): void;

    /**
     * Remove a value from a record using dot notation path
     * @param record Target record (mutated)
     * @param path Dot notation path
     */
    remove(record: JsonObject, path: string): void;

    /**
     * Look up a Vendure entity
     * @param entity Entity type to look up
     * @param by Field/value pairs to search by
     * @param select Fields to return (optional)
     * @returns Found entity or undefined
     */
    lookup<T = JsonValue>(
        entity: LookupEntity,
        by: Record<string, JsonValue>,
        select?: string | readonly string[]
    ): Promise<T | undefined>;

    /** Formatting helpers */
    format: FormatHelpers;

    /** Conversion helpers */
    convert: ConversionHelpers;

    /** Cryptographic helpers */
    crypto: CryptoHelpers;
}

// MAPPING CONFIGURATION

/**
 * Field mapping configuration
 */
export interface FieldMapping {
    /** Source field path */
    readonly source: string;
    /** Target field path */
    readonly target: string;
    /** Optional transformation to apply */
    readonly transform?: FieldTransform;
    /** Default value if source is missing */
    readonly defaultValue?: JsonValue;
    /** Whether the field is required */
    readonly required?: boolean;
}

/**
 * Field transformation types
 */
export type FieldTransform =
    | { type: 'uppercase' }
    | { type: 'lowercase' }
    | { type: 'trim' }
    | { type: 'split'; delimiter: string }
    | { type: 'join'; delimiter: string }
    | { type: 'replace'; pattern: string; replacement: string }
    | { type: 'template'; template: string }
    | { type: 'toNumber' }
    | { type: 'toString' }
    | { type: 'toBoolean' }
    | { type: 'toDate'; format?: string }
    | { type: 'toArray' }
    | { type: 'parseJson' }
    | { type: 'custom'; code: string };

/**
 * Complete mapping configuration for a transform step
 */
export interface MappingConfig {
    /** Field mappings */
    readonly mappings: readonly FieldMapping[];
    /** Whether to include unmapped fields in output */
    readonly passthrough?: boolean;
    /** Fields to explicitly exclude */
    readonly exclude?: readonly string[];
    /** Flatten nested objects */
    readonly flatten?: boolean;
    /** Prefix for flattened fields */
    readonly flattenPrefix?: string;
}

// TRANSFORM STEP CONFIGURATION

/**
 * Transform step definition
 */
export interface TransformStep {
    /** Step type */
    readonly type: 'map' | 'filter' | 'aggregate' | 'flatten' | 'unflatten' | 'split' | 'merge';
    /** Step configuration */
    readonly config: JsonObject;
}

/**
 * Filter condition for filtering records
 */
export interface FilterCondition {
    /** Field to check */
    readonly field: string;
    /** Operator */
    readonly operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'notIn' | 'contains' | 'matches' | 'exists' | 'isNull';
    /** Value to compare against */
    readonly value?: JsonValue;
    /** Logical combination with next condition */
    readonly logic?: 'and' | 'or';
}

/**
 * Filter configuration
 */
export interface FilterConfig {
    /** Filter conditions */
    readonly conditions: readonly FilterCondition[];
    /** Whether to invert the filter (keep non-matching) */
    readonly negate?: boolean;
}

/**
 * Aggregation function types
 */
export type AggregationFunction = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'first' | 'last' | 'collect';

/**
 * Aggregation configuration
 */
export interface AggregationConfig {
    /** Fields to group by */
    readonly groupBy: readonly string[];
    /** Aggregations to compute */
    readonly aggregations: readonly {
        /** Source field */
        readonly field: string;
        /** Aggregation function */
        readonly function: AggregationFunction;
        /** Output field name */
        readonly as: string;
    }[];
}
