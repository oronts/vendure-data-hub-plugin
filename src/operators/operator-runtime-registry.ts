/**
 * Operator Runtime Registry - bridges operator definitions with runtime implementations
 */

import { OperatorAdapter, AdapterOperatorHelpers, AdapterDefinition } from '../sdk/types';
import { DataHubRegistryService } from '../sdk/registry.service';
import { JsonObject } from '../types';

import {
    splitOperator, joinOperator, trimOperator, lowercaseOperator, uppercaseOperator,
    slugifyOperator, concatOperator, replaceOperator, extractRegexOperator, replaceRegexOperator,
    stripHtmlOperator, truncateOperator,
    SPLIT_OPERATOR_DEFINITION, JOIN_OPERATOR_DEFINITION, TRIM_OPERATOR_DEFINITION,
    LOWERCASE_OPERATOR_DEFINITION, UPPERCASE_OPERATOR_DEFINITION, SLUGIFY_OPERATOR_DEFINITION,
    CONCAT_OPERATOR_DEFINITION, REPLACE_OPERATOR_DEFINITION, EXTRACT_REGEX_OPERATOR_DEFINITION,
    REPLACE_REGEX_OPERATOR_DEFINITION, STRIP_HTML_OPERATOR_DEFINITION, TRUNCATE_OPERATOR_DEFINITION,
} from './string';

import {
    dateFormatOperator, dateParseOperator, dateAddOperator, dateDiffOperator,
    nowOperator,
    DATE_FORMAT_OPERATOR_DEFINITION, DATE_PARSE_OPERATOR_DEFINITION,
    DATE_ADD_OPERATOR_DEFINITION, DATE_DIFF_OPERATOR_DEFINITION,
    NOW_OPERATOR_DEFINITION,
} from './date';

import {
    mathOperator, currencyOperator, unitOperator, toNumberOperator, toStringOperator,
    parseNumberOperator, formatNumberOperator, toCentsOperator, roundOperator,
    MATH_OPERATOR_DEFINITION, CURRENCY_OPERATOR_DEFINITION, UNIT_OPERATOR_DEFINITION,
    TO_NUMBER_OPERATOR_DEFINITION, TO_STRING_OPERATOR_DEFINITION,
    PARSE_NUMBER_OPERATOR_DEFINITION, FORMAT_NUMBER_OPERATOR_DEFINITION,
    TO_CENTS_OPERATOR_DEFINITION, ROUND_OPERATOR_DEFINITION,
} from './numeric';

import {
    whenOperator, ifThenElseOperator, switchOperator, deltaFilterOperator,
    WHEN_OPERATOR_DEFINITION, IF_THEN_ELSE_OPERATOR_DEFINITION, SWITCH_OPERATOR_DEFINITION,
    DELTA_FILTER_OPERATOR_DEFINITION,
} from './logic';

import {
    parseJsonOperator, stringifyJsonOperator, pickOperator, omitOperator,
    PARSE_JSON_OPERATOR_DEFINITION, STRINGIFY_JSON_OPERATOR_DEFINITION,
    PICK_OPERATOR_DEFINITION, OMIT_OPERATOR_DEFINITION,
} from './json';

import {
    mapOperator, setOperator, removeOperator, renameOperator, copyOperator,
    templateOperator, hashOperator, uuidOperator,
    MAP_OPERATOR_DEFINITION, SET_OPERATOR_DEFINITION, REMOVE_OPERATOR_DEFINITION,
    RENAME_OPERATOR_DEFINITION, COPY_OPERATOR_DEFINITION, TEMPLATE_OPERATOR_DEFINITION,
    HASH_OPERATOR_DEFINITION, UUID_OPERATOR_DEFINITION,
} from './data';

import {
    lookupOperator, coalesceOperator, enrichOperator, defaultOperator, httpLookupOperator,
    LOOKUP_OPERATOR_DEFINITION, COALESCE_OPERATOR_DEFINITION,
    ENRICH_OPERATOR_DEFINITION, DEFAULT_OPERATOR_DEFINITION, HTTP_LOOKUP_OPERATOR_DEFINITION,
} from './enrichment';

import {
    aggregateOperator, countOperator, uniqueOperator, flattenOperator,
    firstOperator, lastOperator, expandOperator,
    multiJoinOperator,
    AGGREGATE_OPERATOR_DEFINITION, COUNT_OPERATOR_DEFINITION, UNIQUE_OPERATOR_DEFINITION,
    FLATTEN_OPERATOR_DEFINITION, FIRST_OPERATOR_DEFINITION, LAST_OPERATOR_DEFINITION,
    EXPAND_OPERATOR_DEFINITION, MULTI_JOIN_OPERATOR_DEFINITION,
} from './aggregation';

import {
    validateRequiredOperator, validateFormatOperator,
    VALIDATE_REQUIRED_OPERATOR_DEFINITION, VALIDATE_FORMAT_OPERATOR_DEFINITION,
} from './validation';

import {
    scriptOperator, SCRIPT_OPERATOR_DEFINITION,
} from './script';

import {
    imageResizeOperator, IMAGE_RESIZE_OPERATOR_DEFINITION,
    imageConvertOperator, IMAGE_CONVERT_OPERATOR_DEFINITION,
    pdfGenerateOperator, PDF_GENERATE_OPERATOR_DEFINITION,
} from './file';

import { OperatorResult } from './types';

/**
 * Generic operator function type for the registry.
 *
 * Each operator has its own strongly-typed config interface for internal implementation.
 * At the registry level, we accept any config object - runtime validation happens
 * through the operator's schema before execution.
 */
type OperatorConfig = Record<string, unknown>;

type OperatorFn = (
    records: readonly JsonObject[],
    config: OperatorConfig,
    helpers: AdapterOperatorHelpers,
) => OperatorResult | Promise<OperatorResult>;

interface OperatorRegistryEntry {
    definition: AdapterDefinition;
    fn: OperatorFn;
}

/**
 * Helper to cast operator functions to OperatorFn.
 *
 * This is necessary because function parameters are contravariant in TypeScript.
 * Each operator has its own specific config type, but the registry needs a common type.
 * Runtime validation happens through each operator's schema before execution.
 */
const op = <T>(fn: T): OperatorFn => fn as unknown as OperatorFn;

/**
 * Operator registry mapping codes to definitions and implementations.
 */
const OPERATOR_REGISTRY: Record<string, OperatorRegistryEntry> = {
    // String
    split: { definition: SPLIT_OPERATOR_DEFINITION, fn: op(splitOperator) },
    join: { definition: JOIN_OPERATOR_DEFINITION, fn: op(joinOperator) },
    trim: { definition: TRIM_OPERATOR_DEFINITION, fn: op(trimOperator) },
    lowercase: { definition: LOWERCASE_OPERATOR_DEFINITION, fn: op(lowercaseOperator) },
    uppercase: { definition: UPPERCASE_OPERATOR_DEFINITION, fn: op(uppercaseOperator) },
    slugify: { definition: SLUGIFY_OPERATOR_DEFINITION, fn: op(slugifyOperator) },
    concat: { definition: CONCAT_OPERATOR_DEFINITION, fn: op(concatOperator) },
    replace: { definition: REPLACE_OPERATOR_DEFINITION, fn: op(replaceOperator) },
    extractRegex: { definition: EXTRACT_REGEX_OPERATOR_DEFINITION, fn: op(extractRegexOperator) },
    replaceRegex: { definition: REPLACE_REGEX_OPERATOR_DEFINITION, fn: op(replaceRegexOperator) },
    stripHtml: { definition: STRIP_HTML_OPERATOR_DEFINITION, fn: op(stripHtmlOperator) },
    truncate: { definition: TRUNCATE_OPERATOR_DEFINITION, fn: op(truncateOperator) },

    // Date
    dateFormat: { definition: DATE_FORMAT_OPERATOR_DEFINITION, fn: op(dateFormatOperator) },
    dateParse: { definition: DATE_PARSE_OPERATOR_DEFINITION, fn: op(dateParseOperator) },
    dateAdd: { definition: DATE_ADD_OPERATOR_DEFINITION, fn: op(dateAddOperator) },
    dateDiff: { definition: DATE_DIFF_OPERATOR_DEFINITION, fn: op(dateDiffOperator) },
    now: { definition: NOW_OPERATOR_DEFINITION, fn: op(nowOperator) },

    // Numeric
    math: { definition: MATH_OPERATOR_DEFINITION, fn: op(mathOperator) },
    currency: { definition: CURRENCY_OPERATOR_DEFINITION, fn: op(currencyOperator) },
    unit: { definition: UNIT_OPERATOR_DEFINITION, fn: op(unitOperator) },
    toNumber: { definition: TO_NUMBER_OPERATOR_DEFINITION, fn: op(toNumberOperator) },
    toString: { definition: TO_STRING_OPERATOR_DEFINITION, fn: op(toStringOperator) },
    parseNumber: { definition: PARSE_NUMBER_OPERATOR_DEFINITION, fn: op(parseNumberOperator) },
    formatNumber: { definition: FORMAT_NUMBER_OPERATOR_DEFINITION, fn: op(formatNumberOperator) },
    toCents: { definition: TO_CENTS_OPERATOR_DEFINITION, fn: op(toCentsOperator) },
    round: { definition: ROUND_OPERATOR_DEFINITION, fn: op(roundOperator) },

    // Logic
    when: { definition: WHEN_OPERATOR_DEFINITION, fn: op(whenOperator) },
    ifThenElse: { definition: IF_THEN_ELSE_OPERATOR_DEFINITION, fn: op(ifThenElseOperator) },
    switch: { definition: SWITCH_OPERATOR_DEFINITION, fn: op(switchOperator) },
    deltaFilter: { definition: DELTA_FILTER_OPERATOR_DEFINITION, fn: op(deltaFilterOperator) },

    // JSON
    parseJson: { definition: PARSE_JSON_OPERATOR_DEFINITION, fn: op(parseJsonOperator) },
    stringifyJson: { definition: STRINGIFY_JSON_OPERATOR_DEFINITION, fn: op(stringifyJsonOperator) },
    pick: { definition: PICK_OPERATOR_DEFINITION, fn: op(pickOperator) },
    omit: { definition: OMIT_OPERATOR_DEFINITION, fn: op(omitOperator) },

    // Data
    map: { definition: MAP_OPERATOR_DEFINITION, fn: op(mapOperator) },
    set: { definition: SET_OPERATOR_DEFINITION, fn: op(setOperator) },
    remove: { definition: REMOVE_OPERATOR_DEFINITION, fn: op(removeOperator) },
    rename: { definition: RENAME_OPERATOR_DEFINITION, fn: op(renameOperator) },
    copy: { definition: COPY_OPERATOR_DEFINITION, fn: op(copyOperator) },
    template: { definition: TEMPLATE_OPERATOR_DEFINITION, fn: op(templateOperator) },
    hash: { definition: HASH_OPERATOR_DEFINITION, fn: op(hashOperator) },
    uuid: { definition: UUID_OPERATOR_DEFINITION, fn: op(uuidOperator) },

    // Enrichment
    lookup: { definition: LOOKUP_OPERATOR_DEFINITION, fn: op(lookupOperator) },
    coalesce: { definition: COALESCE_OPERATOR_DEFINITION, fn: op(coalesceOperator) },
    enrich: { definition: ENRICH_OPERATOR_DEFINITION, fn: op(enrichOperator) },
    default: { definition: DEFAULT_OPERATOR_DEFINITION, fn: op(defaultOperator) },
    httpLookup: { definition: HTTP_LOOKUP_OPERATOR_DEFINITION, fn: op(httpLookupOperator) },

    // Aggregation
    aggregate: { definition: AGGREGATE_OPERATOR_DEFINITION, fn: op(aggregateOperator) },
    count: { definition: COUNT_OPERATOR_DEFINITION, fn: op(countOperator) },
    unique: { definition: UNIQUE_OPERATOR_DEFINITION, fn: op(uniqueOperator) },
    flatten: { definition: FLATTEN_OPERATOR_DEFINITION, fn: op(flattenOperator) },
    first: { definition: FIRST_OPERATOR_DEFINITION, fn: op(firstOperator) },
    last: { definition: LAST_OPERATOR_DEFINITION, fn: op(lastOperator) },
    expand: { definition: EXPAND_OPERATOR_DEFINITION, fn: op(expandOperator) },
    multiJoin: { definition: MULTI_JOIN_OPERATOR_DEFINITION, fn: op(multiJoinOperator) },

    // Validation
    validateRequired: { definition: VALIDATE_REQUIRED_OPERATOR_DEFINITION, fn: op(validateRequiredOperator) },
    validateFormat: { definition: VALIDATE_FORMAT_OPERATOR_DEFINITION, fn: op(validateFormatOperator) },

    // Advanced/Script
    script: { definition: SCRIPT_OPERATOR_DEFINITION, fn: op(scriptOperator) },

    // File
    imageResize: { definition: IMAGE_RESIZE_OPERATOR_DEFINITION, fn: op(imageResizeOperator) },
    imageConvert: { definition: IMAGE_CONVERT_OPERATOR_DEFINITION, fn: op(imageConvertOperator) },
    pdfGenerate: { definition: PDF_GENERATE_OPERATOR_DEFINITION, fn: op(pdfGenerateOperator) },
};

function convertToSdkResult(result: OperatorResult): import('../sdk/types').OperatorResult {
    return {
        records: result.records,
        dropped: result.dropped,
        errors: result.errors?.map(err => ({
            record: {} as JsonObject,
            message: err.message,
            field: err.field,
        })),
    };
}

function createOperatorAdapter(entry: OperatorRegistryEntry): OperatorAdapter {
    const { definition, fn } = entry;

    return {
        type: 'OPERATOR',
        code: definition.code,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        schema: definition.schema,
        pure: definition.pure ?? true,
        async: definition.async,
        batchable: definition.batchable,
        requires: definition.requires,
        icon: definition.icon,
        color: definition.color,
        version: definition.version,
        deprecated: definition.deprecated,
        deprecatedMessage: definition.deprecatedMessage,

        async apply(
            records: readonly JsonObject[],
            config: OperatorConfig,
            helpers: AdapterOperatorHelpers,
        ): Promise<import('../sdk/types').OperatorResult> {
            const result = await Promise.resolve(fn(records, config, helpers));
            return convertToSdkResult(result);
        },
    };
}

export function getBuiltinOperatorRuntimes(): OperatorAdapter[] {
    return Object.values(OPERATOR_REGISTRY).map(createOperatorAdapter);
}

export function getOperatorRuntime(code: string): OperatorAdapter | undefined {
    const entry = OPERATOR_REGISTRY[code];
    if (!entry) return undefined;
    return createOperatorAdapter(entry);
}

export function getCustomOperatorRuntime(
    registry: DataHubRegistryService | undefined,
    code: string,
): OperatorAdapter | undefined {
    if (!registry) return undefined;
    const adapter = registry.getRuntime('OPERATOR', code);
    if (adapter && 'apply' in adapter) {
        return adapter as OperatorAdapter;
    }
    return undefined;
}

export function hasOperator(code: string): boolean {
    return code in OPERATOR_REGISTRY;
}

export function getOperatorCodes(): string[] {
    return Object.keys(OPERATOR_REGISTRY);
}

export function getOperatorCount(): number {
    return Object.keys(OPERATOR_REGISTRY).length;
}

export function getAllOperatorDefinitions(): AdapterDefinition[] {
    return Object.values(OPERATOR_REGISTRY).map(entry => entry.definition);
}
