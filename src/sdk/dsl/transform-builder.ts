import { JsonValue } from '../../types/index';
import { OperatorConfig, RouteConditionConfig } from './step-configs';
import { TRANSFORM_OPERATOR } from '../constants';

// VALIDATION HELPERS

function validateNonEmptyString(value: string, fieldName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
}

function validateMapping(mapping: Record<string, string>, fieldName: string): void {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        throw new Error(`${fieldName} must be an object`);
    }
    if (Object.keys(mapping).length === 0) {
        throw new Error(`${fieldName} must have at least one entry`);
    }
}

function validateNonEmptyArray<T>(arr: T[], fieldName: string): void {
    if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error(`${fieldName} must be a non-empty array`);
    }
}

// OPERATOR BUILDERS

export const operators = {
    /** `operators.map({ 'product.name': 'title', 'product.sku': 'sku' })` */
    map(mapping: Record<string, string>): OperatorConfig {
        validateMapping(mapping, 'Mapping');
        return { op: TRANSFORM_OPERATOR.MAP, args: { mapping } };
    },

    /** `operators.set('metadata.imported', true)` */
    set(path: string, value: JsonValue): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.SET, args: { path, value } };
    },

    /** `operators.defaults({ 'status': 'active', 'quantity': 0 })` */
    defaults(fields: Record<string, JsonValue>): OperatorConfig {
        return { op: TRANSFORM_OPERATOR.ENRICH, args: { defaults: fields } };
    },

    /** `operators.remove('internal.tempData')` */
    remove(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.REMOVE, args: { path } };
    },

    /** `operators.rename('oldName', 'newName')` */
    rename(from: string, to: string): OperatorConfig {
        validateNonEmptyString(from, 'From path');
        validateNonEmptyString(to, 'To path');
        return { op: TRANSFORM_OPERATOR.RENAME, args: { from, to } };
    },

    /** `operators.when([{ field: 'status', cmp: 'eq', value: 'active' }], 'keep')` */
    when(conditions: RouteConditionConfig[], action: 'keep' | 'drop' = 'keep'): OperatorConfig {
        validateNonEmptyArray(conditions, 'Conditions');
        return { op: TRANSFORM_OPERATOR.WHEN, args: { conditions, action } };
    },

    /** `operators.template('Product: {{name}} ({{sku}})', 'displayName')` */
    template(template: string, target: string, missingAsEmpty = false): OperatorConfig {
        validateNonEmptyString(template, 'Template');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template, target, missingAsEmpty } };
    },

    /** `operators.lookup('countryCode', { 'US': 'United States' }, 'countryName')` */
    lookup(source: string, map: Record<string, JsonValue>, target: string, defaultValue?: JsonValue): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        if (!map || typeof map !== 'object' || Array.isArray(map)) {
            throw new Error('Lookup map must be an object');
        }
        return { op: TRANSFORM_OPERATOR.LOOKUP, args: { source, map, target, default: defaultValue } };
    },

    /** `operators.currency('price', 'priceInCents', 2, 'round')` */
    currency(source: string, target: string, decimals = 2, round: 'round' | 'floor' | 'ceil' = 'round'): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        if (decimals < 0) {
            throw new Error('Decimals must be non-negative');
        }
        return { op: TRANSFORM_OPERATOR.CURRENCY, args: { source, target, decimals, round } };
    },

    /** `operators.unit('weightGrams', 'weightKg', 'g', 'kg')` */
    unit(source: string, target: string, from: string, to: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(from, 'From unit');
        validateNonEmptyString(to, 'To unit');
        return { op: TRANSFORM_OPERATOR.UNIT, args: { source, target, from, to } };
    },

    /** `operators.deltaFilter('sku', ['name', 'price'], ['updatedAt'])` */
    deltaFilter(idPath: string, includePaths?: string[], excludePaths?: string[]): OperatorConfig {
        validateNonEmptyString(idPath, 'ID path');
        return { op: TRANSFORM_OPERATOR.DELTA_FILTER, args: { idPath, includePaths, excludePaths } };
    },

    /** `operators.aggregate('sum', 'quantity', 'totalQuantity')` */
    aggregate(op: 'count' | 'sum' | 'avg' | 'min' | 'max', source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.AGGREGATE, args: { op, source, target } };
    },

    /** `operators.flatten('variants', 'flatVariants')` */
    flatten(sourcePath: string, targetPath?: string): OperatorConfig {
        validateNonEmptyString(sourcePath, 'Source path');
        return { op: TRANSFORM_OPERATOR.FLATTEN, args: { source: sourcePath, target: targetPath } };
    },

    /** `operators.split('tags', 'tagList', ',')` */
    split(source: string, target: string, delimiter = ','): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.SPLIT, args: { source, target, delimiter } };
    },

    /** `operators.join('tagList', 'tags', ', ')` */
    join(source: string, target: string, delimiter = ','): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.JOIN, args: { source, target, delimiter } };
    },

    /** `operators.coalesce(['preferredName', 'displayName', 'name'], 'finalName')` */
    coalesce(paths: string[], target: string): OperatorConfig {
        validateNonEmptyArray(paths, 'Paths');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.COALESCE, args: { paths, target } };
    },

    /** `operators.dateFormat('createdAt', 'formattedDate', 'YYYY-MM-DD')` */
    dateFormat(source: string, target: string, format: string, inputFormat?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(format, 'Format');
        return { op: TRANSFORM_OPERATOR.DATE_FORMAT, args: { source, target, format, inputFormat } };
    },

    /** `operators.parseJson('metadataJson', 'metadata')` */
    parseJson(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.PARSE_JSON, args: { source, target } };
    },

    /** `operators.stringifyJson('metadata', 'metadataJson')` */
    stringifyJson(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.STRINGIFY_JSON, args: { source, target } };
    },

    trim(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.TRIM, args: { path } };
    },

    lowercase(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.LOWERCASE, args: { path } };
    },

    uppercase(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.UPPERCASE, args: { path } };
    },

    /** `operators.slugify('name', 'slug')` */
    slugify(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.SLUGIFY, args: { source, target } };
    },

    /** `operators.filter({ field: 'price', cmp: 'gt', value: 0 })` */
    filter(condition: RouteConditionConfig): OperatorConfig {
        return { op: TRANSFORM_OPERATOR.WHEN, args: { conditions: [condition], action: 'keep' } };
    },

    /** `operators.httpLookup('https://api.example.com/products/{{sku}}', 'externalData')` */
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
