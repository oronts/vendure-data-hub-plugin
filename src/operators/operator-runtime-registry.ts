/**
 * Operator Runtime Registry - bridges operator definitions with runtime implementations
 */

import { OperatorAdapter, OperatorHelpers, AdapterDefinition } from '../sdk/types';
import { JsonObject } from '../types';
import { OperatorResult } from './types';

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
    nowOperator, formatDateOperator,
    DATE_FORMAT_OPERATOR_DEFINITION, DATE_PARSE_OPERATOR_DEFINITION,
    DATE_ADD_OPERATOR_DEFINITION, DATE_DIFF_OPERATOR_DEFINITION,
    NOW_OPERATOR_DEFINITION, FORMAT_DATE_OPERATOR_DEFINITION,
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
    coalesceOperator, lookupOperator,
    WHEN_OPERATOR_DEFINITION, IF_THEN_ELSE_OPERATOR_DEFINITION, SWITCH_OPERATOR_DEFINITION,
    DELTA_FILTER_OPERATOR_DEFINITION, COALESCE_OPERATOR_DEFINITION, LOOKUP_OPERATOR_DEFINITION,
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
    enrichOperator, defaultOperator,
    ENRICH_OPERATOR_DEFINITION, DEFAULT_OPERATOR_DEFINITION,
} from './enrichment';

import {
    aggregateOperator, countOperator, uniqueOperator, flattenOperator,
    firstOperator, lastOperator, expandOperator,
    AGGREGATE_OPERATOR_DEFINITION, COUNT_OPERATOR_DEFINITION, UNIQUE_OPERATOR_DEFINITION,
    FLATTEN_OPERATOR_DEFINITION, FIRST_OPERATOR_DEFINITION, LAST_OPERATOR_DEFINITION,
    EXPAND_OPERATOR_DEFINITION,
} from './aggregation';

import {
    validateRequiredOperator, validateFormatOperator,
    VALIDATE_REQUIRED_OPERATOR_DEFINITION, VALIDATE_FORMAT_OPERATOR_DEFINITION,
} from './validation';

import {
    scriptOperator, SCRIPT_OPERATOR_DEFINITION,
} from './script';

type OperatorFn = (
    records: readonly JsonObject[],
    config: any,
    helpers: OperatorHelpers,
) => OperatorResult | Promise<OperatorResult>;

interface OperatorRegistryEntry {
    definition: AdapterDefinition;
    fn: OperatorFn;
}

const OPERATOR_REGISTRY: Record<string, OperatorRegistryEntry> = {
    // String
    split: { definition: SPLIT_OPERATOR_DEFINITION, fn: splitOperator },
    join: { definition: JOIN_OPERATOR_DEFINITION, fn: joinOperator },
    trim: { definition: TRIM_OPERATOR_DEFINITION, fn: trimOperator },
    lowercase: { definition: LOWERCASE_OPERATOR_DEFINITION, fn: lowercaseOperator },
    uppercase: { definition: UPPERCASE_OPERATOR_DEFINITION, fn: uppercaseOperator },
    slugify: { definition: SLUGIFY_OPERATOR_DEFINITION, fn: slugifyOperator },
    concat: { definition: CONCAT_OPERATOR_DEFINITION, fn: concatOperator },
    replace: { definition: REPLACE_OPERATOR_DEFINITION, fn: replaceOperator },
    extractRegex: { definition: EXTRACT_REGEX_OPERATOR_DEFINITION, fn: extractRegexOperator },
    replaceRegex: { definition: REPLACE_REGEX_OPERATOR_DEFINITION, fn: replaceRegexOperator },
    stripHtml: { definition: STRIP_HTML_OPERATOR_DEFINITION, fn: stripHtmlOperator },
    truncate: { definition: TRUNCATE_OPERATOR_DEFINITION, fn: truncateOperator },

    // Date
    dateFormat: { definition: DATE_FORMAT_OPERATOR_DEFINITION, fn: dateFormatOperator },
    dateParse: { definition: DATE_PARSE_OPERATOR_DEFINITION, fn: dateParseOperator },
    dateAdd: { definition: DATE_ADD_OPERATOR_DEFINITION, fn: dateAddOperator },
    dateDiff: { definition: DATE_DIFF_OPERATOR_DEFINITION, fn: dateDiffOperator },
    now: { definition: NOW_OPERATOR_DEFINITION, fn: nowOperator },
    formatDate: { definition: FORMAT_DATE_OPERATOR_DEFINITION, fn: formatDateOperator },

    // Numeric
    math: { definition: MATH_OPERATOR_DEFINITION, fn: mathOperator },
    currency: { definition: CURRENCY_OPERATOR_DEFINITION, fn: currencyOperator },
    unit: { definition: UNIT_OPERATOR_DEFINITION, fn: unitOperator },
    toNumber: { definition: TO_NUMBER_OPERATOR_DEFINITION, fn: toNumberOperator },
    toString: { definition: TO_STRING_OPERATOR_DEFINITION, fn: toStringOperator },
    parseNumber: { definition: PARSE_NUMBER_OPERATOR_DEFINITION, fn: parseNumberOperator },
    formatNumber: { definition: FORMAT_NUMBER_OPERATOR_DEFINITION, fn: formatNumberOperator },
    toCents: { definition: TO_CENTS_OPERATOR_DEFINITION, fn: toCentsOperator },
    round: { definition: ROUND_OPERATOR_DEFINITION, fn: roundOperator },

    // Logic
    when: { definition: WHEN_OPERATOR_DEFINITION, fn: whenOperator },
    ifThenElse: { definition: IF_THEN_ELSE_OPERATOR_DEFINITION, fn: ifThenElseOperator },
    switch: { definition: SWITCH_OPERATOR_DEFINITION, fn: switchOperator },
    deltaFilter: { definition: DELTA_FILTER_OPERATOR_DEFINITION, fn: deltaFilterOperator },
    coalesce: { definition: COALESCE_OPERATOR_DEFINITION, fn: coalesceOperator },
    lookup: { definition: LOOKUP_OPERATOR_DEFINITION, fn: lookupOperator },

    // JSON
    parseJson: { definition: PARSE_JSON_OPERATOR_DEFINITION, fn: parseJsonOperator },
    stringifyJson: { definition: STRINGIFY_JSON_OPERATOR_DEFINITION, fn: stringifyJsonOperator },
    pick: { definition: PICK_OPERATOR_DEFINITION, fn: pickOperator },
    omit: { definition: OMIT_OPERATOR_DEFINITION, fn: omitOperator },

    // Data
    map: { definition: MAP_OPERATOR_DEFINITION, fn: mapOperator },
    set: { definition: SET_OPERATOR_DEFINITION, fn: setOperator },
    remove: { definition: REMOVE_OPERATOR_DEFINITION, fn: removeOperator },
    rename: { definition: RENAME_OPERATOR_DEFINITION, fn: renameOperator },
    copy: { definition: COPY_OPERATOR_DEFINITION, fn: copyOperator },
    template: { definition: TEMPLATE_OPERATOR_DEFINITION, fn: templateOperator },
    hash: { definition: HASH_OPERATOR_DEFINITION, fn: hashOperator },
    uuid: { definition: UUID_OPERATOR_DEFINITION, fn: uuidOperator },

    // Enrichment
    enrich: { definition: ENRICH_OPERATOR_DEFINITION, fn: enrichOperator },
    default: { definition: DEFAULT_OPERATOR_DEFINITION, fn: defaultOperator },

    // Aggregation
    aggregate: { definition: AGGREGATE_OPERATOR_DEFINITION, fn: aggregateOperator },
    count: { definition: COUNT_OPERATOR_DEFINITION, fn: countOperator },
    unique: { definition: UNIQUE_OPERATOR_DEFINITION, fn: uniqueOperator },
    flatten: { definition: FLATTEN_OPERATOR_DEFINITION, fn: flattenOperator },
    first: { definition: FIRST_OPERATOR_DEFINITION, fn: firstOperator },
    last: { definition: LAST_OPERATOR_DEFINITION, fn: lastOperator },
    expand: { definition: EXPAND_OPERATOR_DEFINITION, fn: expandOperator },

    // Validation
    validateRequired: { definition: VALIDATE_REQUIRED_OPERATOR_DEFINITION, fn: validateRequiredOperator },
    validateFormat: { definition: VALIDATE_FORMAT_OPERATOR_DEFINITION, fn: validateFormatOperator },

    // Advanced/Script
    script: { definition: SCRIPT_OPERATOR_DEFINITION, fn: scriptOperator },
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
        type: 'operator',
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
            config: any,
            helpers: OperatorHelpers,
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
