import type { JsonObject } from '../../types/index';
import type { OperatorConfig } from './step-configs';
import { TRANSFORM_OPERATOR } from '../constants';
import { OPERATOR_LIMITS } from '../../constants/defaults/runtime-defaults';
import { SAFE_EVALUATOR } from '../../constants/defaults';
import {
    validateMapping,
    validateNonEmptyString,
    validatePositiveNumber,
} from './validation-helpers';
import {
    createOperator,
    validateOptionalString,
    validateRegex,
    validateStringArray,
} from './transform-builder.helpers';

const IMAGE_QUALITY_MIN = 1;
const IMAGE_QUALITY_MAX = 100;

function validateOptionalPositiveInteger(value: number | undefined, fieldName: string): void {
    if (value === undefined) return;
    validatePositiveNumber(value, fieldName);
    if (!Number.isSafeInteger(value)) {
        throw new Error(`${fieldName} must be an integer`);
    }
}

function validateImageQuality(quality: number | undefined): void {
    if (quality === undefined) return;
    if (
        !Number.isSafeInteger(quality)
        || quality < IMAGE_QUALITY_MIN
        || quality > IMAGE_QUALITY_MAX
    ) {
        throw new Error(
            `Quality must be an integer from ${IMAGE_QUALITY_MIN} to ${IMAGE_QUALITY_MAX}`,
        );
    }
}

export const collectionTransformOperators = {
    aggregate(
        op: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'first' | 'last',
        source: string | undefined,
        target: string,
    ): OperatorConfig {
        if (op !== 'count') {
            validateNonEmptyString(source ?? '', 'Source');
        } else {
            validateOptionalString(source, 'Source');
        }
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.AGGREGATE, { op, source, target });
    },

    count(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.COUNT, { source, target });
    },

    unique(source: string, target?: string, by?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateOptionalString(target, 'Target');
        validateOptionalString(by, 'By');
        return createOperator(TRANSFORM_OPERATOR.UNIQUE, { source, target, by });
    },

    deduplicateRecords(
        key: string,
        options: {
            keep?: 'FIRST' | 'LAST' | 'LOWEST' | 'HIGHEST';
            priority?: string;
        } = {},
    ): OperatorConfig {
        validateNonEmptyString(key, 'Key');
        const keep = options.keep ?? 'FIRST';
        if ((keep === 'LOWEST' || keep === 'HIGHEST') && !options.priority) {
            throw new Error(`Priority is required when keep is ${keep}`);
        }
        validateOptionalString(options.priority, 'Priority');
        return createOperator(TRANSFORM_OPERATOR.DEDUPLICATE_RECORDS, {
            key,
            keep,
            priority: options.priority,
        });
    },

    flatten(source: string, target?: string, depth?: number): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateOptionalString(target, 'Target');
        validateOptionalPositiveInteger(depth, 'Depth');
        return createOperator(TRANSFORM_OPERATOR.FLATTEN, { source, target, depth });
    },

    first(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.FIRST, { source, target });
    },

    last(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.LAST, { source, target });
    },

    expand(
        path: string,
        mergeParent = false,
        parentFields?: Record<string, string>,
    ): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        if (parentFields !== undefined) {
            validateMapping(parentFields, 'Parent fields');
        }
        return createOperator(TRANSFORM_OPERATOR.EXPAND, {
            path,
            mergeParent,
            parentFields,
        });
    },

    multiJoin(config: {
        leftKey: string;
        rightKey: string;
        rightData: JsonObject[];
        type?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
        prefix?: string;
        select?: string[];
        maxOutputRecords?: number;
    }): OperatorConfig {
        validateNonEmptyString(config.leftKey, 'Left key');
        validateNonEmptyString(config.rightKey, 'Right key');
        validateOptionalString(config.prefix, 'Prefix');
        if (config.select !== undefined) {
            validateStringArray(config.select, 'Select');
        }
        if (!Array.isArray(config.rightData)) {
            throw new Error('Right data must be an array');
        }
        if (config.rightData.length > OPERATOR_LIMITS.MAX_MULTI_JOIN_RIGHT_RECORDS) {
            throw new Error(
                `Right data must contain at most ${OPERATOR_LIMITS.MAX_MULTI_JOIN_RIGHT_RECORDS} records`,
            );
        }
        if (config.rightData.some(record => (
            record === null || typeof record !== 'object' || Array.isArray(record)
        ))) {
            throw new Error('Right data must contain only objects');
        }
        if (config.maxOutputRecords !== undefined) {
            validateOptionalPositiveInteger(
                config.maxOutputRecords,
                'Maximum output records',
            );
            if (config.maxOutputRecords > OPERATOR_LIMITS.MAX_MULTI_JOIN_OUTPUT_RECORDS) {
                throw new Error(
                    `Maximum output records must be at most ${OPERATOR_LIMITS.MAX_MULTI_JOIN_OUTPUT_RECORDS}`,
                );
            }
        }
        return createOperator(TRANSFORM_OPERATOR.MULTI_JOIN, {
            ...config,
            type: config.type ?? 'LEFT',
        });
    },

    validateRequired(fields: string[], errorField?: string): OperatorConfig {
        validateStringArray(fields, 'Fields');
        validateOptionalString(errorField, 'Error field');
        return createOperator(TRANSFORM_OPERATOR.VALIDATE_REQUIRED, {
            fields,
            errorField,
        });
    },

    validateFormat(
        field: string,
        pattern: string,
        errorField?: string,
        errorMessage?: string,
    ): OperatorConfig {
        validateNonEmptyString(field, 'Field');
        validateNonEmptyString(pattern, 'Pattern');
        validateOptionalString(errorField, 'Error field');
        validateOptionalString(errorMessage, 'Error message');
        validateRegex(pattern);
        return createOperator(TRANSFORM_OPERATOR.VALIDATE_FORMAT, {
            field,
            pattern,
            errorField,
            errorMessage,
        });
    },

    script(
        code: string,
        options?: {
            batch?: boolean;
            timeout?: number;
            failOnError?: boolean;
            context?: JsonObject;
        },
    ): OperatorConfig {
        validateNonEmptyString(code, 'Code');
        if (
            options?.timeout !== undefined
            && (
                !Number.isSafeInteger(options.timeout)
                || options.timeout < SAFE_EVALUATOR.MIN_TIMEOUT_MS
                || options.timeout > SAFE_EVALUATOR.MAX_TIMEOUT_MS
            )
        ) {
            throw new Error(
                `Timeout must be an integer between ${SAFE_EVALUATOR.MIN_TIMEOUT_MS}`
                + ` and ${SAFE_EVALUATOR.MAX_TIMEOUT_MS}`,
            );
        }
        return createOperator(TRANSFORM_OPERATOR.SCRIPT, { code, ...options });
    },

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
        validateOptionalString(config.targetField, 'Target field');
        validateOptionalPositiveInteger(config.width, 'Width');
        validateOptionalPositiveInteger(config.height, 'Height');
        validateImageQuality(config.quality);
        return createOperator(TRANSFORM_OPERATOR.IMAGE_RESIZE, config);
    },

    imageConvert(config: {
        sourceField: string;
        targetField?: string;
        format: 'jpeg' | 'png' | 'webp' | 'avif' | 'gif';
        quality?: number;
    }): OperatorConfig {
        validateNonEmptyString(config.sourceField, 'Source field');
        validateOptionalString(config.targetField, 'Target field');
        validateImageQuality(config.quality);
        return createOperator(TRANSFORM_OPERATOR.IMAGE_CONVERT, config);
    },

    pdfGenerate(config: {
        template?: string;
        templateField?: string;
        targetField: string;
        pageSize?: 'A4' | 'LETTER' | 'A3';
        orientation?: 'PORTRAIT' | 'LANDSCAPE';
    }): OperatorConfig {
        validateOptionalString(config.template, 'Template');
        validateOptionalString(config.templateField, 'Template field');
        if (config.template === undefined && config.templateField === undefined) {
            throw new Error('Template or template field is required');
        }
        validateNonEmptyString(config.targetField, 'Target field');
        return createOperator(TRANSFORM_OPERATOR.PDF_GENERATE, config);
    },
};
