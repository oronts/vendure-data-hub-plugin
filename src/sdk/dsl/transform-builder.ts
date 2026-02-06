/**
 * Transform/Operator Builders
 *
 * Fluent builder functions for creating operator configurations
 * used in pipeline transform steps. All operators use constants from
 * `../constants.ts` for type safety.
 *
 * @module sdk/dsl/transform-builder
 *
 * @example
 * ```typescript
 * import { operators } from '@vendure/data-hub/sdk';
 *
 * const pipeline = createPipeline()
 *   .transform('map-fields', {
 *     operators: [
 *       operators.map({ 'source.sku': 'sku', 'source.name': 'title' }),
 *       operators.set('imported', true),
 *       operators.template('{{sku}}-{{title}}', 'slug'),
 *     ],
 *   })
 *   .build();
 * ```
 */

import { JsonValue } from '../../types/index';
import { OperatorConfig, RouteConditionConfig } from './step-configs';
import { TRANSFORM_OPERATOR } from '../constants';

// VALIDATION HELPERS

/**
 * Validates that a string is non-empty.
 * @throws Error if the string is empty or whitespace-only
 */
function validateNonEmptyString(value: string, fieldName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
}

/**
 * Validates that a value is a valid mapping object.
 * @throws Error if the mapping is invalid
 */
function validateMapping(mapping: Record<string, string>, fieldName: string): void {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        throw new Error(`${fieldName} must be an object`);
    }
    if (Object.keys(mapping).length === 0) {
        throw new Error(`${fieldName} must have at least one entry`);
    }
}

/**
 * Validates that a value is a non-empty array.
 * @throws Error if not a valid non-empty array
 */
function validateNonEmptyArray<T>(arr: T[], fieldName: string): void {
    if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error(`${fieldName} must be a non-empty array`);
    }
}

// OPERATOR BUILDERS

/**
 * Operator builder functions for creating transform step configurations.
 * Each function returns an OperatorConfig that can be used in a transform step.
 */
export const operators = {
    /**
     * Map fields from source paths to destination fields.
     *
     * @param mapping - Object mapping source paths to destination fields
     * @returns OperatorConfig for the map operation
     * @throws Error if mapping is empty or invalid
     *
     * @example
     * operators.map({ 'product.name': 'title', 'product.sku': 'sku' })
     */
    map(mapping: Record<string, string>): OperatorConfig {
        validateMapping(mapping, 'Mapping');
        return { op: TRANSFORM_OPERATOR.MAP, args: { mapping } };
    },

    /**
     * Set a static value at a path.
     *
     * @param path - The field path to set
     * @param value - The value to set
     * @returns OperatorConfig for the set operation
     * @throws Error if path is empty
     *
     * @example
     * operators.set('metadata.imported', true)
     */
    set(path: string, value: JsonValue): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.SET, args: { path, value } };
    },

    /**
     * Set default values for missing fields.
     *
     * @param fields - Object mapping field paths to default values
     * @returns OperatorConfig for the enrich/defaults operation
     *
     * @example
     * operators.defaults({ 'status': 'active', 'quantity': 0 })
     */
    defaults(fields: Record<string, JsonValue>): OperatorConfig {
        return { op: TRANSFORM_OPERATOR.ENRICH, args: { defaults: fields } };
    },

    /**
     * Remove a field at path.
     *
     * @param path - The field path to remove
     * @returns OperatorConfig for the remove operation
     * @throws Error if path is empty
     *
     * @example
     * operators.remove('internal.tempData')
     */
    remove(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.REMOVE, args: { path } };
    },

    /**
     * Rename a field.
     *
     * @param from - Source field path
     * @param to - Destination field path
     * @returns OperatorConfig for the rename operation
     * @throws Error if from or to is empty
     *
     * @example
     * operators.rename('oldName', 'newName')
     */
    rename(from: string, to: string): OperatorConfig {
        validateNonEmptyString(from, 'From path');
        validateNonEmptyString(to, 'To path');
        return { op: TRANSFORM_OPERATOR.RENAME, args: { from, to } };
    },

    /**
     * Filter records by conditions.
     *
     * @param conditions - Array of conditions to evaluate
     * @param action - Action to take: 'keep' matching records or 'drop' them
     * @returns OperatorConfig for the when operation
     * @throws Error if conditions array is empty
     *
     * @example
     * operators.when([{ field: 'status', cmp: 'eq', value: 'active' }], 'keep')
     */
    when(conditions: RouteConditionConfig[], action: 'keep' | 'drop' = 'keep'): OperatorConfig {
        validateNonEmptyArray(conditions, 'Conditions');
        return { op: TRANSFORM_OPERATOR.WHEN, args: { conditions, action } };
    },

    /**
     * Render a string template.
     *
     * @param template - Template string with {{field}} placeholders
     * @param target - Target field to store the result
     * @param missingAsEmpty - If true, missing fields render as empty string
     * @returns OperatorConfig for the template operation
     * @throws Error if template or target is empty
     *
     * @example
     * operators.template('Product: {{name}} ({{sku}})', 'displayName')
     */
    template(template: string, target: string, missingAsEmpty = false): OperatorConfig {
        validateNonEmptyString(template, 'Template');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template, target, missingAsEmpty } };
    },

    /**
     * Lookup value from a map.
     *
     * @param source - Source field path
     * @param map - Lookup map of values
     * @param target - Target field to store the result
     * @param defaultValue - Default value if not found in map
     * @returns OperatorConfig for the lookup operation
     * @throws Error if source, target, or map is invalid
     *
     * @example
     * operators.lookup('countryCode', { 'US': 'United States', 'UK': 'United Kingdom' }, 'countryName')
     */
    lookup(source: string, map: Record<string, JsonValue>, target: string, defaultValue?: JsonValue): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        if (!map || typeof map !== 'object' || Array.isArray(map)) {
            throw new Error('Lookup map must be an object');
        }
        return { op: TRANSFORM_OPERATOR.LOOKUP, args: { source, map, target, default: defaultValue } };
    },

    /**
     * Convert currency to minor units.
     *
     * @param source - Source field containing the amount
     * @param target - Target field for the converted value
     * @param decimals - Number of decimal places (default: 2)
     * @param round - Rounding strategy (default: 'round')
     * @returns OperatorConfig for the currency operation
     * @throws Error if source or target is empty, or decimals is negative
     *
     * @example
     * operators.currency('price', 'priceInCents', 2, 'round')
     */
    currency(source: string, target: string, decimals = 2, round: 'round' | 'floor' | 'ceil' = 'round'): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        if (decimals < 0) {
            throw new Error('Decimals must be non-negative');
        }
        return { op: TRANSFORM_OPERATOR.CURRENCY, args: { source, target, decimals, round } };
    },

    /**
     * Convert units (e.g., g to kg).
     *
     * @param source - Source field path
     * @param target - Target field path
     * @param from - Source unit
     * @param to - Target unit
     * @returns OperatorConfig for the unit operation
     * @throws Error if any parameter is empty
     *
     * @example
     * operators.unit('weightGrams', 'weightKg', 'g', 'kg')
     */
    unit(source: string, target: string, from: string, to: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(from, 'From unit');
        validateNonEmptyString(to, 'To unit');
        return { op: TRANSFORM_OPERATOR.UNIT, args: { source, target, from, to } };
    },

    /**
     * Filter out unchanged records using delta detection.
     *
     * @param idPath - Path to the record ID field
     * @param includePaths - Paths to include in delta comparison
     * @param excludePaths - Paths to exclude from delta comparison
     * @returns OperatorConfig for the deltaFilter operation
     * @throws Error if idPath is empty
     *
     * @example
     * operators.deltaFilter('sku', ['name', 'price'], ['updatedAt'])
     */
    deltaFilter(idPath: string, includePaths?: string[], excludePaths?: string[]): OperatorConfig {
        validateNonEmptyString(idPath, 'ID path');
        return { op: TRANSFORM_OPERATOR.DELTA_FILTER, args: { idPath, includePaths, excludePaths } };
    },

    /**
     * Compute an aggregate over records.
     *
     * @param op - Aggregation operation
     * @param source - Source field path
     * @param target - Target field for the result
     * @returns OperatorConfig for the aggregate operation
     * @throws Error if source or target is empty
     *
     * @example
     * operators.aggregate('sum', 'quantity', 'totalQuantity')
     */
    aggregate(op: 'count' | 'sum' | 'avg' | 'min' | 'max', source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.AGGREGATE, args: { op, source, target } };
    },

    /**
     * Flatten nested arrays.
     *
     * @param sourcePath - Path to the array to flatten
     * @param targetPath - Optional target path for the flattened result
     * @returns OperatorConfig for the flatten operation
     * @throws Error if sourcePath is empty
     *
     * @example
     * operators.flatten('variants', 'flatVariants')
     */
    flatten(sourcePath: string, targetPath?: string): OperatorConfig {
        validateNonEmptyString(sourcePath, 'Source path');
        return { op: TRANSFORM_OPERATOR.FLATTEN, args: { source: sourcePath, target: targetPath } };
    },

    /**
     * Split a string into an array.
     *
     * @param source - Source field path
     * @param target - Target field path
     * @param delimiter - Split delimiter (default: ',')
     * @returns OperatorConfig for the split operation
     * @throws Error if source or target is empty
     *
     * @example
     * operators.split('tags', 'tagList', ',')
     */
    split(source: string, target: string, delimiter = ','): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.SPLIT, args: { source, target, delimiter } };
    },

    /**
     * Join an array into a string.
     *
     * @param source - Source field path
     * @param target - Target field path
     * @param delimiter - Join delimiter (default: ',')
     * @returns OperatorConfig for the join operation
     * @throws Error if source or target is empty
     *
     * @example
     * operators.join('tagList', 'tags', ', ')
     */
    join(source: string, target: string, delimiter = ','): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.JOIN, args: { source, target, delimiter } };
    },

    /**
     * Coalesce - return first non-null value from paths.
     *
     * @param paths - Array of field paths to check
     * @param target - Target field for the result
     * @returns OperatorConfig for the coalesce operation
     * @throws Error if paths array is empty or target is empty
     *
     * @example
     * operators.coalesce(['preferredName', 'displayName', 'name'], 'finalName')
     */
    coalesce(paths: string[], target: string): OperatorConfig {
        validateNonEmptyArray(paths, 'Paths');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.COALESCE, args: { paths, target } };
    },

    /**
     * Format a date.
     *
     * @param source - Source field path
     * @param target - Target field path
     * @param format - Output format string
     * @param inputFormat - Optional input format string
     * @returns OperatorConfig for the dateFormat operation
     * @throws Error if source, target, or format is empty
     *
     * @example
     * operators.dateFormat('createdAt', 'formattedDate', 'YYYY-MM-DD')
     */
    dateFormat(source: string, target: string, format: string, inputFormat?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(format, 'Format');
        return { op: TRANSFORM_OPERATOR.DATE_FORMAT, args: { source, target, format, inputFormat } };
    },

    /**
     * Parse JSON string to object.
     *
     * @param source - Source field containing JSON string
     * @param target - Optional target field (defaults to source)
     * @returns OperatorConfig for the parseJson operation
     * @throws Error if source is empty
     *
     * @example
     * operators.parseJson('metadataJson', 'metadata')
     */
    parseJson(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.PARSE_JSON, args: { source, target } };
    },

    /**
     * Stringify object to JSON.
     *
     * @param source - Source field containing object
     * @param target - Optional target field (defaults to source)
     * @returns OperatorConfig for the stringifyJson operation
     * @throws Error if source is empty
     *
     * @example
     * operators.stringifyJson('metadata', 'metadataJson')
     */
    stringifyJson(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.STRINGIFY_JSON, args: { source, target } };
    },

    /**
     * Trim whitespace from string.
     *
     * @param path - Field path to trim
     * @returns OperatorConfig for the trim operation
     * @throws Error if path is empty
     *
     * @example
     * operators.trim('name')
     */
    trim(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.TRIM, args: { path } };
    },

    /**
     * Convert to lowercase.
     *
     * @param path - Field path to convert
     * @returns OperatorConfig for the lowercase operation
     * @throws Error if path is empty
     *
     * @example
     * operators.lowercase('email')
     */
    lowercase(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.LOWERCASE, args: { path } };
    },

    /**
     * Convert to uppercase.
     *
     * @param path - Field path to convert
     * @returns OperatorConfig for the uppercase operation
     * @throws Error if path is empty
     *
     * @example
     * operators.uppercase('countryCode')
     */
    uppercase(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.UPPERCASE, args: { path } };
    },

    /**
     * Slugify a string.
     *
     * @param source - Source field path
     * @param target - Target field path
     * @returns OperatorConfig for the slugify operation
     * @throws Error if source or target is empty
     *
     * @example
     * operators.slugify('name', 'slug')
     */
    slugify(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.SLUGIFY, args: { source, target } };
    },

    /**
     * Validate with custom logic and drop invalid.
     *
     * @param condition - Condition to evaluate
     * @returns OperatorConfig for the filter operation
     *
     * @example
     * operators.filter({ field: 'price', cmp: 'gt', value: 0 })
     */
    filter(condition: RouteConditionConfig): OperatorConfig {
        return { op: TRANSFORM_OPERATOR.WHEN, args: { conditions: [condition], action: 'keep' } };
    },

    /**
     * Enrich records by fetching data from external HTTP endpoints.
     *
     * @param url - HTTP endpoint URL. Use {{field}} for dynamic values
     * @param target - Field path to store the response data
     * @param options - Additional configuration options
     * @returns OperatorConfig for httpLookup
     * @throws Error if url or target is empty
     *
     * @example
     * // Simple GET lookup
     * operators.httpLookup('https://api.example.com/products/{{sku}}', 'externalData')
     *
     * @example
     * // With authentication and caching
     * operators.httpLookup('https://api.example.com/lookup', 'enrichedData', {
     *   method: 'POST',
     *   bodyField: 'lookupKey',
     *   bearerTokenSecretCode: 'api-token',
     *   cacheTtlSec: 600,
     *   responsePath: 'data.result'
     * })
     */
    httpLookup(
        url: string,
        target: string,
        options?: {
            /** HTTP method (GET or POST) */
            method?: 'GET' | 'POST';
            /** Field to use as lookup key */
            keyField?: string;
            /** JSON path to extract from response */
            responsePath?: string;
            /** Default value if lookup fails */
            default?: JsonValue;
            /** Request timeout in milliseconds */
            timeoutMs?: number;
            /** Cache TTL in seconds */
            cacheTtlSec?: number;
            /** Custom headers */
            headers?: Record<string, string>;
            /** Secret code for Bearer token authentication */
            bearerTokenSecretCode?: string;
            /** Secret code for API key authentication */
            apiKeySecretCode?: string;
            /** Header name for API key */
            apiKeyHeader?: string;
            /** Secret code for Basic authentication */
            basicAuthSecretCode?: string;
            /** Field to use as request body */
            bodyField?: string;
            /** Static request body */
            body?: JsonValue;
            /** Skip lookup on 404 response */
            skipOn404?: boolean;
            /** Fail pipeline on error */
            failOnError?: boolean;
            /** Maximum retry attempts */
            maxRetries?: number;
        },
    ): OperatorConfig {
        validateNonEmptyString(url, 'URL');
        validateNonEmptyString(target, 'Target');
        return {
            op: TRANSFORM_OPERATOR.HTTP_LOOKUP,
            args: {
                url,
                target,
                ...options,
            },
        };
    },
};
