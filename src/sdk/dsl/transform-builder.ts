import { JsonObject, JsonValue } from '../../types/index';
import { OperatorConfig, RouteConditionConfig } from './step-configs';
import { TRANSFORM_OPERATOR } from '../constants';
import {
    validateNonEmptyString,
    validateNonEmptyArray,
    validateMapping,
    validatePositiveNumber,
} from './validation-helpers';

// OPERATOR BUILDERS

export const operators = {

    // =========================================================================
    // DATA OPERATORS
    // =========================================================================

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

    /** `operators.copy('source.field', 'target.field')` */
    copy(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.COPY, args: { source, target } };
    },

    /** `operators.template('Product: ${name} (${sku})', 'displayName')` */
    template(template: string, target: string, options?: { missingAsEmpty?: boolean; skipIfEmpty?: boolean }): OperatorConfig {
        validateNonEmptyString(template, 'Template');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template, target, ...options } };
    },

    /** `operators.hash('sku', 'skuHash')` or `operators.hash(['sku', 'name'], 'compositeHash', 'sha256')` */
    hash(
        source: string | string[],
        target: string,
        algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512' = 'sha256',
        encoding: 'hex' | 'base64' = 'hex',
    ): OperatorConfig {
        if (typeof source === 'string') {
            validateNonEmptyString(source, 'Source');
        } else {
            validateNonEmptyArray(source, 'Source');
        }
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.HASH, args: { source, target, algorithm, encoding } };
    },

    /** `operators.uuid('id')` or `operators.uuid('id', 'v5', namespace, 'name')` */
    uuid(
        target: string,
        version: 'v4' | 'v5' = 'v4',
        namespace?: string,
        source?: string,
    ): OperatorConfig {
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.UUID, args: { target, version, namespace, source } };
    },

    // =========================================================================
    // STRING OPERATORS
    // =========================================================================

    /** `operators.trim('name')` */
    trim(path: string, mode?: 'both' | 'start' | 'end'): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.TRIM, args: { path, mode } };
    },

    /** `operators.lowercase('email')` */
    lowercase(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.LOWERCASE, args: { path } };
    },

    /** `operators.uppercase('countryCode')` */
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

    /** `operators.concat(['firstName', 'lastName'], 'fullName', ' ')` */
    concat(sources: string[], target: string, separator = ''): OperatorConfig {
        validateNonEmptyArray(sources, 'Sources');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.CONCAT, args: { sources, target, separator } };
    },

    /** `operators.replace('description', 'foo', 'bar')` */
    replace(path: string, search: string, replacement: string, all = false): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        validateNonEmptyString(search, 'Search');
        return { op: TRANSFORM_OPERATOR.REPLACE, args: { path, search, replacement, all } };
    },

    /** `operators.extractRegex('text', 'extracted', '(\\d+)')` */
    extractRegex(source: string, target: string, pattern: string, group = 1, flags = ''): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(pattern, 'Pattern');
        return { op: TRANSFORM_OPERATOR.EXTRACT_REGEX, args: { source, target, pattern, group, flags } };
    },

    /** `operators.replaceRegex('text', '\\d+', 'NUM')` */
    replaceRegex(path: string, pattern: string, replacement: string, flags = 'g'): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        validateNonEmptyString(pattern, 'Pattern');
        return { op: TRANSFORM_OPERATOR.REPLACE_REGEX, args: { path, pattern, replacement, flags } };
    },

    /** `operators.stripHtml('htmlContent', 'plainText')` */
    stripHtml(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.STRIP_HTML, args: { source, target } };
    },

    /** `operators.truncate('description', 100, '...')` */
    truncate(source: string, length: number, suffix = '', target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validatePositiveNumber(length, 'Length');
        return { op: TRANSFORM_OPERATOR.TRUNCATE, args: { source, target, length, suffix } };
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

    // =========================================================================
    // NUMERIC OPERATORS
    // =========================================================================

    /** `operators.math('add', 'price', 'total', 'tax')` */
    math(
        operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo' | 'power' | 'round' | 'floor' | 'ceil' | 'abs',
        source: string,
        target: string,
        operand?: string,
        decimals?: number,
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.MATH, args: { operation, source, target, operand, decimals } };
    },

    /** `operators.toNumber('priceStr', 'price')` */
    toNumber(source: string, target?: string, defaultValue?: number): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.TO_NUMBER, args: { source, target, default: defaultValue } };
    },

    /** `operators.toString('quantity', 'quantityStr')` */
    toString(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.TO_STRING, args: { source, target } };
    },

    /** `operators.parseNumber('priceStr', 'price', 'de-DE')` */
    parseNumber(source: string, target?: string, locale?: string, defaultValue?: number): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.PARSE_NUMBER, args: { source, target, locale, default: defaultValue } };
    },

    /** `operators.formatNumber('price', 'formattedPrice', { locale: 'en-US', decimals: 2 })` */
    formatNumber(
        source: string,
        target: string,
        options?: {
            locale?: string;
            decimals?: number;
            currency?: string;
            style?: 'decimal' | 'currency' | 'percent';
            useGrouping?: boolean;
        },
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.FORMAT_NUMBER, args: { source, target, ...options } };
    },

    /** `operators.toCents('price', 'priceInCents')` */
    toCents(source: string, target: string, round: 'round' | 'floor' | 'ceil' = 'round'): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.TO_CENTS, args: { source, target, round } };
    },

    /** `operators.round('score', 'roundedScore', 2)` */
    round(source: string, target?: string, decimals = 0, mode: 'round' | 'floor' | 'ceil' = 'round'): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.ROUND, args: { source, target, decimals, mode } };
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

    // =========================================================================
    // DATE OPERATORS
    // =========================================================================

    /** `operators.dateFormat('createdAt', 'formattedDate', 'YYYY-MM-DD')` */
    dateFormat(source: string, target: string, format: string, inputFormat?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(format, 'Format');
        return { op: TRANSFORM_OPERATOR.DATE_FORMAT, args: { source, target, format, inputFormat } };
    },

    /** `operators.dateParse('dateStr', 'parsedDate', 'DD/MM/YYYY')` */
    dateParse(source: string, target: string, format: string, timezone?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(format, 'Format');
        return { op: TRANSFORM_OPERATOR.DATE_PARSE, args: { source, target, format, timezone } };
    },

    /** `operators.dateAdd('createdAt', 'expiresAt', 30, 'days')` */
    dateAdd(
        source: string,
        target: string,
        amount: number,
        unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years',
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.DATE_ADD, args: { source, target, amount, unit } };
    },

    /** `operators.dateDiff('startDate', 'endDate', 'durationDays', 'days')` */
    dateDiff(
        startDate: string,
        endDate: string,
        target: string,
        unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years',
        absolute = false,
    ): OperatorConfig {
        validateNonEmptyString(startDate, 'Start date');
        validateNonEmptyString(endDate, 'End date');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.DATE_DIFF, args: { startDate, endDate, target, unit, absolute } };
    },

    /** `operators.now('processedAt')` or `operators.now('timestamp', 'ISO', 'UTC')` */
    now(target: string, format?: string, timezone?: string): OperatorConfig {
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.NOW, args: { target, format, timezone } };
    },

    // =========================================================================
    // LOGIC OPERATORS
    // =========================================================================

    /** `operators.when([{ field: 'status', cmp: 'eq', value: 'active' }], 'keep')` */
    when(conditions: RouteConditionConfig[], action: 'keep' | 'drop' = 'keep'): OperatorConfig {
        validateNonEmptyArray(conditions, 'Conditions');
        return { op: TRANSFORM_OPERATOR.WHEN, args: { conditions, action } };
    },

    /** `operators.filter({ field: 'price', cmp: 'gt', value: 0 })` */
    filter(condition: RouteConditionConfig): OperatorConfig {
        return { op: TRANSFORM_OPERATOR.WHEN, args: { conditions: [condition], action: 'keep' } };
    },

    /** `operators.ifThenElse({ field: 'stock', operator: 'gt', value: 0 }, 'In Stock', 'Out of Stock', 'availability')` */
    ifThenElse(
        condition: { field: string; operator?: string; cmp?: string; value: JsonValue },
        thenValue: JsonValue,
        elseValue: JsonValue | undefined,
        target: string,
    ): OperatorConfig {
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.IF_THEN_ELSE, args: { condition, thenValue, elseValue, target } };
    },

    /** `operators.switch('status', [{ value: 'A', result: 'Active' }, { value: 'I', result: 'Inactive' }], 'statusLabel', 'Unknown')` */
    switch(
        source: string,
        cases: Array<{ value: JsonValue; result: JsonValue }>,
        target: string,
        defaultValue?: JsonValue,
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyArray(cases, 'Cases');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.SWITCH, args: { source, cases, target, default: defaultValue } };
    },

    /** `operators.deltaFilter('sku', ['name', 'price'], ['updatedAt'])` */
    deltaFilter(idPath: string, includePaths?: string[], excludePaths?: string[]): OperatorConfig {
        validateNonEmptyString(idPath, 'ID path');
        return { op: TRANSFORM_OPERATOR.DELTA_FILTER, args: { idPath, includePaths, excludePaths } };
    },

    // =========================================================================
    // JSON OPERATORS
    // =========================================================================

    /** `operators.parseJson('metadataJson', 'metadata')` */
    parseJson(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.PARSE_JSON, args: { source, target } };
    },

    /** `operators.stringifyJson('metadata', 'metadataJson')` */
    stringifyJson(source: string, target?: string, pretty = false): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.STRINGIFY_JSON, args: { source, target, pretty } };
    },

    /** `operators.pick(['name', 'sku', 'price'])` */
    pick(fields: string[]): OperatorConfig {
        validateNonEmptyArray(fields, 'Fields');
        return { op: TRANSFORM_OPERATOR.PICK, args: { fields } };
    },

    /** `operators.omit(['internal', 'tempData', 'debug'])` */
    omit(fields: string[]): OperatorConfig {
        validateNonEmptyArray(fields, 'Fields');
        return { op: TRANSFORM_OPERATOR.OMIT, args: { fields } };
    },

    // =========================================================================
    // ENRICHMENT OPERATORS
    // =========================================================================

    /** `operators.lookup('countryCode', { 'US': 'United States' }, 'countryName')` */
    lookup(source: string, map: Record<string, JsonValue>, target: string, defaultValue?: JsonValue): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        if (!map || typeof map !== 'object' || Array.isArray(map)) {
            throw new Error('Lookup map must be an object');
        }
        return { op: TRANSFORM_OPERATOR.LOOKUP, args: { source, map, target, default: defaultValue } };
    },

    /** `operators.coalesce(['preferredName', 'displayName', 'name'], 'finalName')` */
    coalesce(paths: string[], target: string, defaultValue?: JsonValue): OperatorConfig {
        validateNonEmptyArray(paths, 'Paths');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.COALESCE, args: { paths, target, default: defaultValue } };
    },

    /** `operators.enrich({ defaults: { status: 'active' }, set: { source: 'import' } })` */
    enrich(config: { set?: Record<string, JsonValue>; defaults?: Record<string, JsonValue> }): OperatorConfig {
        return { op: TRANSFORM_OPERATOR.ENRICH, args: config };
    },

    /** `operators.defaults({ 'status': 'active', 'quantity': 0 })` -- alias for enrich with defaults */
    defaults(fields: Record<string, JsonValue>): OperatorConfig {
        return { op: TRANSFORM_OPERATOR.ENRICH, args: { defaults: fields } };
    },

    /** `operators.default('status', 'active')` -- set a single default value */
    default(path: string, value: JsonValue): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.DEFAULT, args: { path, value } };
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

    // =========================================================================
    // AGGREGATION OPERATORS
    // =========================================================================

    /** `operators.aggregate('sum', 'quantity', 'totalQuantity')` */
    aggregate(
        op: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'first' | 'last',
        source: string,
        target: string,
        groupBy?: string,
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.AGGREGATE, args: { op, source, target, groupBy } };
    },

    /** `operators.count('items', 'itemCount')` */
    count(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.COUNT, args: { source, target } };
    },

    /** `operators.unique('tags', 'uniqueTags')` or `operators.unique('items', undefined, 'id')` */
    unique(source: string, target?: string, by?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        return { op: TRANSFORM_OPERATOR.UNIQUE, args: { source, target, by } };
    },

    /** `operators.flatten('variants', 'flatVariants')` or `operators.flatten('variants', { preserveParent: true, parentFields: ['sku'] })` */
    flatten(sourcePath: string, targetOrOptions?: string | { target?: string; depth?: number; preserveParent?: boolean; parentFields?: string[] }, depth?: number): OperatorConfig {
        validateNonEmptyString(sourcePath, 'Source path');
        if (typeof targetOrOptions === 'object') {
            return { op: TRANSFORM_OPERATOR.FLATTEN, args: { source: sourcePath, ...targetOrOptions } };
        }
        return { op: TRANSFORM_OPERATOR.FLATTEN, args: { source: sourcePath, target: targetOrOptions, depth } };
    },

    /** `operators.first('items', 'firstItem')` */
    first(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.FIRST, args: { source, target } };
    },

    /** `operators.last('items', 'lastItem')` */
    last(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return { op: TRANSFORM_OPERATOR.LAST, args: { source, target } };
    },

    /** `operators.expand('variants', true)` or `operators.expand('variants', false, { sku: 'parentSku' })` */
    expand(path: string, mergeParent = false, parentFields?: Record<string, string>): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return { op: TRANSFORM_OPERATOR.EXPAND, args: { path, mergeParent, parentFields } };
    },

    /** `operators.multiJoin({ leftKey: 'categoryId', rightKey: 'id', rightData: [...], type: 'LEFT' })` */
    multiJoin(config: {
        leftKey: string;
        rightKey: string;
        rightDataPath?: string;
        rightData?: JsonObject[];
        type?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
        prefix?: string;
        select?: string[];
    }): OperatorConfig {
        validateNonEmptyString(config.leftKey, 'Left key');
        validateNonEmptyString(config.rightKey, 'Right key');
        return { op: TRANSFORM_OPERATOR.MULTI_JOIN, args: { ...config, type: config.type ?? 'LEFT' } };
    },

    // =========================================================================
    // VALIDATION OPERATORS
    // =========================================================================

    /** `operators.validateRequired(['name', 'sku', 'price'])` */
    validateRequired(fields: string[], errorField?: string): OperatorConfig {
        validateNonEmptyArray(fields, 'Fields');
        return { op: TRANSFORM_OPERATOR.VALIDATE_REQUIRED, args: { fields, errorField } };
    },

    /** `operators.validateFormat('email', '^[^@]+@[^@]+\\.[^@]+$', 'errors', 'Invalid email')` */
    validateFormat(field: string, pattern: string, errorField?: string, errorMessage?: string): OperatorConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(pattern, 'Pattern');
        return { op: TRANSFORM_OPERATOR.VALIDATE_FORMAT, args: { field, pattern, errorField, errorMessage } };
    },

    // =========================================================================
    // SCRIPT OPERATOR
    // =========================================================================

    /** `operators.script('return { ...record, total: record.price * record.quantity }')` */
    script(
        code: string,
        options?: {
            /** Process all records at once instead of one at a time */
            batch?: boolean;
            /** Timeout in milliseconds (default: 5000) */
            timeout?: number;
            /** Fail entire step on error (default: false) */
            failOnError?: boolean;
            /** Context data passed to the script */
            context?: JsonObject;
        },
    ): OperatorConfig {
        validateNonEmptyString(code, 'Code');
        return { op: TRANSFORM_OPERATOR.SCRIPT, args: { code, ...options } };
    },

    // =========================================================================
    // FILE OPERATORS
    // =========================================================================

    /** `operators.imageResize({ sourceField: 'image', width: 800, height: 600, format: 'webp' })` */
    imageResize(config: {
        sourceField: string;
        targetField?: string;
        width?: number;
        height?: number;
        fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
        format?: 'jpeg' | 'png' | 'webp' | 'avif';
        quality?: number;
    }): OperatorConfig {
        validateNonEmptyString(config.sourceField, 'Source field');
        return { op: TRANSFORM_OPERATOR.IMAGE_RESIZE, args: { ...config } };
    },

    /** `operators.imageConvert({ sourceField: 'image', format: 'webp', quality: 80 })` */
    imageConvert(config: {
        sourceField: string;
        targetField?: string;
        format: 'jpeg' | 'png' | 'webp' | 'avif' | 'gif';
        quality?: number;
    }): OperatorConfig {
        validateNonEmptyString(config.sourceField, 'Source field');
        return { op: TRANSFORM_OPERATOR.IMAGE_CONVERT, args: { ...config } };
    },

    /** `operators.pdfGenerate({ template: '<h1>{{name}}</h1>', targetField: 'pdfData' })` */
    pdfGenerate(config: {
        template?: string;
        templateField?: string;
        targetField: string;
        pageSize?: 'A4' | 'LETTER' | 'A3';
        orientation?: 'PORTRAIT' | 'LANDSCAPE';
    }): OperatorConfig {
        validateNonEmptyString(config.targetField, 'Target field');
        return { op: TRANSFORM_OPERATOR.PDF_GENERATE, args: { ...config } };
    },
};
