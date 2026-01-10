/**
 * Transform Executor
 *
 * Executes transform chains on field values.
 * Supports all transform types defined in pipeline-definition.ts
 * with extensibility for custom transforms.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Transform, TransformType } from '../types/index';
import { JsonValue, JsonObject } from '../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';
import { LOGGER_CONTEXTS } from '../constants/index';

import { CustomTransformFn, CustomTransformInfo } from './types';

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
} from './record';

import { performLookup, applyMap } from './record';

import {
    getNestedValue,
    interpolateTemplate,
    evaluateCondition,
    evaluateExpression,
} from './helpers';

import { BUILTIN_CUSTOM_TRANSFORMS } from './custom-transforms';

export { CustomTransformFn, CustomTransformInfo } from './types';

@Injectable()
export class TransformExecutor implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private customTransforms = new Map<string, CustomTransformFn>();
    private transformRegistry = new Map<string, CustomTransformInfo>();

    constructor(
        private connection: TransactionalConnection,
        private moduleRef: ModuleRef,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.TRANSFORM_EXECUTOR);
    }

    async onModuleInit() {
        // Register built-in custom transforms
        for (const transform of BUILTIN_CUSTOM_TRANSFORMS) {
            this.registerCustomTransform(transform);
        }

        this.logger.info(`Transform executor initialized`, { recordCount: this.customTransforms.size });
    }

    /**
     * Register a custom transform
     * Can be called by plugins to add new transform types
     */
    registerCustomTransform(info: CustomTransformInfo): void {
        this.customTransforms.set(info.type, info.transform);
        this.transformRegistry.set(info.type, info);
        this.logger.debug(`Registered custom transform: ${info.type}`);
    }

    /**
     * Get all registered transforms (built-in + custom)
     */
    getRegisteredTransforms(): CustomTransformInfo[] {
        return Array.from(this.transformRegistry.values());
    }

    /**
     * Check if a transform type is available
     */
    hasTransform(type: string): boolean {
        return this.customTransforms.has(type) || this.isBuiltInTransform(type);
    }

    private isBuiltInTransform(type: string): boolean {
        const builtInTypes: TransformType[] = [
            'TRIM', 'LOWERCASE', 'UPPERCASE', 'SLUGIFY', 'TRUNCATE', 'PAD',
            'REPLACE', 'REGEX_REPLACE', 'REGEX_EXTRACT', 'SPLIT', 'JOIN', 'CONCAT', 'TEMPLATE',
            'STRIP_HTML', 'ESCAPE_HTML', 'TITLE_CASE', 'SENTENCE_CASE',
            'PARSE_NUMBER', 'PARSE_INT', 'PARSE_FLOAT', 'ROUND', 'FLOOR', 'CEIL', 'ABS',
            'TO_CENTS', 'FROM_CENTS', 'MATH',
            'PARSE_DATE', 'FORMAT_DATE', 'NOW',
            'PARSE_BOOLEAN', 'NEGATE',
            'TO_STRING', 'TO_NUMBER', 'TO_BOOLEAN', 'TO_ARRAY', 'TO_JSON', 'PARSE_JSON',
            'LOOKUP', 'MAP',
            'IF_ELSE', 'COALESCE', 'DEFAULT',
            'FIRST', 'LAST', 'NTH', 'FILTER', 'MAP_ARRAY', 'FLATTEN',
            'EXPRESSION',
        ];
        return builtInTypes.includes(type as TransformType);
    }

    /**
     * Execute a chain of transforms on a value
     */
    async execute(
        ctx: RequestContext,
        value: JsonValue,
        transforms: Transform[],
        record?: JsonObject,
    ): Promise<JsonValue> {
        let result = value;

        for (const transform of transforms) {
            try {
                result = await this.applyTransform(ctx, result, transform, record);
            } catch (error) {
                this.logger.warn(
                    `Transform ${transform.type} failed: ${error instanceof Error ? error.message : error}`,
                );
                // Continue with current value on error
            }
        }

        return result;
    }

    /**
     * Apply a single transform
     */
    private async applyTransform(
        ctx: RequestContext,
        value: JsonValue,
        transform: Transform,
        record?: JsonObject,
    ): Promise<JsonValue> {
        const config = transform.config ?? {};

        switch (transform.type) {
            // STRING TRANSFORMS

            case 'TRIM':
                return applyTrim(value);

            case 'LOWERCASE':
                return applyLowercase(value);

            case 'UPPERCASE':
                return applyUppercase(value);

            case 'SLUGIFY':
                return applySlugify(value);

            case 'TRUNCATE':
                return applyTruncate(value, config);

            case 'PAD':
                return applyPad(value, config);

            case 'REPLACE':
                return applyReplace(value, config);

            case 'REGEX_REPLACE':
                return applyRegexReplace(value, config);

            case 'REGEX_EXTRACT':
                return applyRegexExtract(value, config);

            case 'SPLIT':
                return applySplit(value, config);

            case 'JOIN':
                return applyJoin(value, config);

            case 'CONCAT':
                return applyConcat(value, config, record, getNestedValue);

            case 'TEMPLATE':
                return applyTemplate(value, config, record, interpolateTemplate);

            case 'STRIP_HTML':
                return applyStripHtml(value);

            case 'ESCAPE_HTML':
                return applyEscapeHtml(value);

            case 'TITLE_CASE':
                return applyTitleCase(value);

            case 'SENTENCE_CASE':
                return applySentenceCase(value);

            // NUMBER TRANSFORMS

            case 'PARSE_NUMBER':
            case 'PARSE_FLOAT':
                return applyParseNumber(value);

            case 'PARSE_INT':
                return applyParseInt(value);

            case 'ROUND':
                return applyRound(value, config);

            case 'FLOOR':
                return applyFloor(value);

            case 'CEIL':
                return applyCeil(value);

            case 'ABS':
                return applyAbs(value);

            case 'TO_CENTS':
                return applyToCents(value);

            case 'FROM_CENTS':
                return applyFromCents(value);

            case 'MATH':
                return applyMath(value, config);

            // DATE TRANSFORMS

            case 'PARSE_DATE':
                return applyParseDate(value, config);

            case 'FORMAT_DATE':
                return applyFormatDate(value, config);

            case 'NOW':
                return applyNow();

            // BOOLEAN TRANSFORMS

            case 'PARSE_BOOLEAN':
                return applyParseBoolean(value, config);

            case 'NEGATE':
                return applyNegate(value);

            // TYPE CONVERSION

            case 'TO_STRING':
                return applyToString(value);

            case 'TO_NUMBER':
                return applyToNumber(value);

            case 'TO_BOOLEAN':
                return applyToBoolean(value);

            case 'TO_ARRAY':
                return applyToArray(value);

            case 'TO_JSON':
                return applyToJson(value);

            case 'PARSE_JSON':
                return applyParseJson(value);

            // LOOKUP TRANSFORMS

            case 'LOOKUP':
                return await performLookup(ctx, value, config, this.connection);

            case 'MAP':
                return applyMap(value, config);

            // CONDITIONAL TRANSFORMS

            case 'IF_ELSE':
                return applyIfElse(value, config, record);

            case 'COALESCE':
                return applyCoalesce(value, config, record);

            case 'DEFAULT':
                return applyDefault(value, config);

            // ARRAY TRANSFORMS

            case 'FIRST':
                return applyFirst(value);

            case 'LAST':
                return applyLast(value);

            case 'NTH':
                return applyNth(value, config);

            case 'FILTER':
                return applyFilter(value, config, record);

            case 'MAP_ARRAY':
                return applyMapArray(value, config, record);

            case 'FLATTEN':
                return applyFlatten(value);

            // CUSTOM EXPRESSION

            case 'EXPRESSION':
                if (config.expression) {
                    return evaluateExpression(config.expression, value, record);
                }
                return value;

            default: {
                const customTransform = this.customTransforms.get(transform.type);
                if (customTransform) {
                    return await customTransform(ctx, value, config, record);
                }
                this.logger.warn(`Unknown transform type: ${transform.type}`);
                return value;
            }
        }
    }
}
