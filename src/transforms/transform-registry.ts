/**
 * Transform Registry
 *
 * Single source of truth for all built-in transform types.
 * Maps TransformType strings to their handler functions, replacing
 * the manual switch statement and hardcoded isBuiltInTransform() array.
 *
 * Special cases not in this registry:
 * - LOOKUP: requires RequestContext + TransactionalConnection (async, instance-bound)
 */

import { TransformConfig, JsonValue, JsonObject } from '../types/index';

import {
    applyTrim,
    applyLowercase,
    applyUppercase,
    applySlugify,
    applyTruncate,
    applyPad,
    applyReplace,
    applyRegexReplace,
    applyRegexExtract,
    applySplit,
    applyJoin,
    applyConcat,
    applyTemplate,
    applyStripHtml,
    applyEscapeHtml,
    applyTitleCase,
    applySentenceCase,
    applyParseNumber,
    applyParseInt,
    applyRound,
    applyFloor,
    applyCeil,
    applyAbs,
    applyToCents,
    applyFromCents,
    applyMath,
    applyParseDate,
    applyFormatDate,
    applyNow,
    applyParseBoolean,
    applyNegate,
    applyFirst,
    applyLast,
    applyNth,
    applyFlatten,
} from './field';

import {
    applyToString,
    applyToNumber,
    applyToBoolean,
    applyToArray,
    applyToJson,
    applyParseJson,
} from './field';

import {
    applyIfElse,
    applyCoalesce,
    applyDefault,
    applyFilter,
    applyMapArray,
} from './record/record-transforms';

import { applyMap } from './record/lookup-transforms';

import { getNestedValue, evaluateExpression } from './helpers/expression-eval';
import { interpolateTemplate } from './helpers/template-engine';

/**
 * Built-in transform function signature.
 * All built-in transforms receive (value, config, record) and return a JsonValue synchronously.
 */
type BuiltInTransformFn = (
    value: JsonValue,
    config: TransformConfig,
    record?: JsonObject,
) => JsonValue;

/**
 * Registry mapping TransformType strings to their handler functions.
 * Covers all built-in transforms except LOOKUP (which requires async context).
 */
export const TRANSFORM_REGISTRY: ReadonlyMap<string, BuiltInTransformFn> = new Map<string, BuiltInTransformFn>([
    // STRING TRANSFORMS
    ['TRIM', (value) => applyTrim(value)],
    ['LOWERCASE', (value) => applyLowercase(value)],
    ['UPPERCASE', (value) => applyUppercase(value)],
    ['SLUGIFY', (value) => applySlugify(value)],
    ['TRUNCATE', (value, config) => applyTruncate(value, config)],
    ['PAD', (value, config) => applyPad(value, config)],
    ['REPLACE', (value, config) => applyReplace(value, config)],
    ['REGEX_REPLACE', (value, config) => applyRegexReplace(value, config)],
    ['REGEX_EXTRACT', (value, config) => applyRegexExtract(value, config)],
    ['SPLIT', (value, config) => applySplit(value, config)],
    ['JOIN', (value, config) => applyJoin(value, config)],
    ['CONCAT', (value, config, record) => applyConcat(value, config, record, getNestedValue)],
    ['TEMPLATE', (value, config, record) => applyTemplate(value, config, record, interpolateTemplate)],
    ['STRIP_HTML', (value) => applyStripHtml(value)],
    ['ESCAPE_HTML', (value) => applyEscapeHtml(value)],
    ['TITLE_CASE', (value) => applyTitleCase(value)],
    ['SENTENCE_CASE', (value) => applySentenceCase(value)],

    // NUMBER TRANSFORMS
    ['PARSE_NUMBER', (value) => applyParseNumber(value)],
    ['PARSE_FLOAT', (value) => applyParseNumber(value)],
    ['PARSE_INT', (value) => applyParseInt(value)],
    ['ROUND', (value, config) => applyRound(value, config)],
    ['FLOOR', (value) => applyFloor(value)],
    ['CEIL', (value) => applyCeil(value)],
    ['ABS', (value) => applyAbs(value)],
    ['TO_CENTS', (value) => applyToCents(value)],
    ['FROM_CENTS', (value) => applyFromCents(value)],
    ['MATH', (value, config) => applyMath(value, config)],

    // DATE TRANSFORMS
    ['PARSE_DATE', (value, config) => applyParseDate(value, config)],
    ['FORMAT_DATE', (value, config) => applyFormatDate(value, config)],
    ['NOW', () => applyNow()],

    // BOOLEAN TRANSFORMS
    ['PARSE_BOOLEAN', (value, config) => applyParseBoolean(value, config)],
    ['NEGATE', (value) => applyNegate(value)],

    // TYPE CONVERSION
    ['TO_STRING', (value) => applyToString(value)],
    ['TO_NUMBER', (value) => applyToNumber(value)],
    ['TO_BOOLEAN', (value) => applyToBoolean(value)],
    ['TO_ARRAY', (value) => applyToArray(value)],
    ['TO_JSON', (value) => applyToJson(value)],
    ['PARSE_JSON', (value) => applyParseJson(value)],

    // MAP TRANSFORM
    ['MAP', (value, config) => applyMap(value, config)],

    // CONDITIONAL TRANSFORMS
    ['IF_ELSE', (value, config, record) => applyIfElse(value, config, record)],
    ['COALESCE', (value, config, record) => applyCoalesce(value, config, record)],
    ['DEFAULT', (value, config) => applyDefault(value, config)],

    // ARRAY TRANSFORMS
    ['FIRST', (value) => applyFirst(value)],
    ['LAST', (value) => applyLast(value)],
    ['NTH', (value, config) => applyNth(value, config)],
    ['FILTER', (value, config, record) => applyFilter(value, config, record)],
    ['MAP_ARRAY', (value, config, record) => applyMapArray(value, config, record)],
    ['FLATTEN', (value) => applyFlatten(value)],

    // CUSTOM EXPRESSION
    ['EXPRESSION', (value, config, record) => {
        if (config.expression) {
            return evaluateExpression(config.expression, value, record);
        }
        return value;
    }],
]);

/**
 * Check if a transform type is a built-in type.
 * Includes LOOKUP which is not in the registry but is still built-in.
 */
export function isBuiltInTransform(type: string): boolean {
    return TRANSFORM_REGISTRY.has(type) || type === 'LOOKUP';
}
