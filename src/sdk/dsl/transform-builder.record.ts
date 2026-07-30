import type { JsonValue } from '../../types/index';
import type { OperatorConfig } from './step-configs';
import type { UnitType } from '../types/transform-types';
import { TRANSFORM_OPERATOR } from '../constants';
import { TRANSFORM_LIMITS } from '../../constants/defaults/core-defaults';
import {
    validateMapping,
    validateNonEmptyString,
    validatePositiveNumber,
} from './validation-helpers';
import {
    createOperator,
    validateNonNegativeInteger,
    validateOptionalString,
    validateRegex,
    validateStringArray,
} from './transform-builder.helpers';

function validateDecimalPlaces(value: number): void {
    validateNonNegativeInteger(value, 'Decimals');
    if (value > TRANSFORM_LIMITS.MAX_DECIMAL_PLACES) {
        throw new Error(
            `Decimals must be at most ${TRANSFORM_LIMITS.MAX_DECIMAL_PLACES}`,
        );
    }
}

export const recordTransformOperators = {
    /** Mapping keys are target paths and values are source paths. */
    map(mapping: Record<string, string>): OperatorConfig {
        validateMapping(mapping, 'Mapping');
        validateStringArray(Object.keys(mapping), 'Mapping targets');
        validateStringArray(Object.values(mapping), 'Mapping sources');
        return createOperator(TRANSFORM_OPERATOR.MAP, { mapping });
    },

    set(path: string, value: JsonValue): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return createOperator(TRANSFORM_OPERATOR.SET, { path, value });
    },

    remove(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return createOperator(TRANSFORM_OPERATOR.REMOVE, { path });
    },

    rename(from: string, to: string): OperatorConfig {
        validateNonEmptyString(from, 'From path');
        validateNonEmptyString(to, 'To path');
        return createOperator(TRANSFORM_OPERATOR.RENAME, { from, to });
    },

    copy(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.COPY, { source, target });
    },

    template(
        template: string,
        target: string,
        options?: { missingAsEmpty?: boolean },
    ): OperatorConfig {
        validateNonEmptyString(template, 'Template');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.TEMPLATE, { template, target, ...options });
    },

    hash(
        source: string | string[],
        target: string,
        algorithm: 'sha256' | 'sha512' = 'sha256',
        encoding: 'hex' | 'base64' = 'hex',
    ): OperatorConfig {
        if (typeof source === 'string') {
            validateNonEmptyString(source, 'Source');
        } else {
            validateStringArray(source, 'Source');
        }
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.HASH, {
            source,
            target,
            algorithm,
            encoding,
        });
    },

    uuid(
        target: string,
        version: 'v4' | 'v5' = 'v4',
        namespace?: string,
        source?: string,
    ): OperatorConfig {
        validateNonEmptyString(target, 'Target');
        if (version === 'v5') {
            validateNonEmptyString(namespace ?? '', 'Namespace');
            validateNonEmptyString(source ?? '', 'Source');
        } else if (namespace !== undefined || source !== undefined) {
            throw new Error('Namespace and source are only valid for UUID v5');
        }
        return createOperator(TRANSFORM_OPERATOR.UUID, {
            target,
            version,
            namespace,
            source,
        });
    },

    trim(path: string, mode?: 'both' | 'start' | 'end'): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return createOperator(TRANSFORM_OPERATOR.TRIM, { path, mode });
    },

    lowercase(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return createOperator(TRANSFORM_OPERATOR.LOWERCASE, { path });
    },

    uppercase(path: string): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return createOperator(TRANSFORM_OPERATOR.UPPERCASE, { path });
    },

    slugify(source: string, target: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.SLUGIFY, { source, target });
    },

    concat(sources: string[], target: string, separator = ''): OperatorConfig {
        validateStringArray(sources, 'Sources');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.CONCAT, { sources, target, separator });
    },

    replace(path: string, search: string, replacement: string, all = false): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        validateNonEmptyString(search, 'Search');
        return createOperator(TRANSFORM_OPERATOR.REPLACE, {
            path,
            search,
            replacement,
            all,
        });
    },

    extractRegex(
        source: string,
        target: string,
        pattern: string,
        group = 1,
        flags = '',
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(pattern, 'Pattern');
        validateNonNegativeInteger(group, 'Group');
        validateRegex(pattern, flags.replace(/g/g, ''));
        return createOperator(TRANSFORM_OPERATOR.EXTRACT_REGEX, {
            source,
            target,
            pattern,
            group,
            flags,
        });
    },

    replaceRegex(path: string, pattern: string, replacement: string, flags = 'g'): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        validateNonEmptyString(pattern, 'Pattern');
        validateRegex(pattern, flags);
        return createOperator(TRANSFORM_OPERATOR.REPLACE_REGEX, {
            path,
            pattern,
            replacement,
            flags,
        });
    },

    stripHtml(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateOptionalString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.STRIP_HTML, { source, target });
    },

    truncate(source: string, length: number, suffix = '', target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validatePositiveNumber(length, 'Length');
        if (!Number.isSafeInteger(length)) {
            throw new Error('Length must be an integer');
        }
        validateOptionalString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.TRUNCATE, {
            source,
            target,
            length,
            suffix,
        });
    },

    split(source: string, target: string, delimiter = ','): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.SPLIT, { source, target, delimiter });
    },

    join(source: string, target: string, delimiter = ','): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.JOIN, { source, target, delimiter });
    },

    math(
        operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo'
            | 'power' | 'round' | 'floor' | 'ceil' | 'abs',
        source: string,
        target: string,
        operand?: string,
        decimals?: number,
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateOptionalString(operand, 'Operand');
        if (decimals !== undefined) {
            validateDecimalPlaces(decimals);
        }
        return createOperator(TRANSFORM_OPERATOR.MATH, {
            operation,
            source,
            target,
            operand,
            decimals,
        });
    },

    toNumber(source: string, target?: string, defaultValue?: number): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateOptionalString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.TO_NUMBER, {
            source,
            target,
            default: defaultValue,
        });
    },

    toString(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateOptionalString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.TO_STRING, { source, target });
    },

    parseNumber(
        source: string,
        target?: string,
        locale?: string,
        defaultValue?: number,
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateOptionalString(target, 'Target');
        validateOptionalString(locale, 'Locale');
        return createOperator(TRANSFORM_OPERATOR.PARSE_NUMBER, {
            source,
            target,
            locale,
            default: defaultValue,
        });
    },

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
        validateOptionalString(options?.locale, 'Locale');
        validateOptionalString(options?.currency, 'Currency');
        if (options?.decimals !== undefined) {
            validateDecimalPlaces(options.decimals);
        }
        if (options?.style === 'currency' && !options.currency) {
            throw new Error('Currency is required for currency formatting');
        }
        return createOperator(TRANSFORM_OPERATOR.FORMAT_NUMBER, {
            source,
            target,
            ...options,
        });
    },

    toCents(
        source: string,
        target: string,
        round: 'round' | 'floor' | 'ceil' = 'round',
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.TO_CENTS, { source, target, round });
    },

    round(
        source: string,
        target?: string,
        decimals = 0,
        mode: 'round' | 'floor' | 'ceil' = 'round',
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateOptionalString(target, 'Target');
        validateDecimalPlaces(decimals);
        return createOperator(TRANSFORM_OPERATOR.ROUND, {
            source,
            target,
            decimals,
            mode,
        });
    },

    currency(
        source: string,
        target: string,
        decimals = 2,
        round: 'round' | 'floor' | 'ceil' = 'round',
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateDecimalPlaces(decimals);
        return createOperator(TRANSFORM_OPERATOR.CURRENCY, {
            source,
            target,
            decimals,
            round,
        });
    },

    unit(source: string, target: string, from: UnitType, to: UnitType): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(from, 'From unit');
        validateNonEmptyString(to, 'To unit');
        return createOperator(TRANSFORM_OPERATOR.UNIT, { source, target, from, to });
    },

    dateFormat(
        source: string,
        target: string,
        format: string,
        inputFormat?: string,
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(format, 'Format');
        validateOptionalString(inputFormat, 'Input format');
        return createOperator(TRANSFORM_OPERATOR.DATE_FORMAT, {
            source,
            target,
            format,
            inputFormat,
        });
    },

    dateParse(source: string, target: string, format: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        validateNonEmptyString(format, 'Format');
        return createOperator(TRANSFORM_OPERATOR.DATE_PARSE, { source, target, format });
    },

    dateAdd(
        source: string,
        target: string,
        amount: number,
        unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years',
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        if (!Number.isFinite(amount)) {
            throw new Error('Amount must be a finite number');
        }
        return createOperator(TRANSFORM_OPERATOR.DATE_ADD, { source, target, amount, unit });
    },

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
        return createOperator(TRANSFORM_OPERATOR.DATE_DIFF, {
            startDate,
            endDate,
            target,
            unit,
            absolute,
        });
    },

    now(target: string, format?: string): OperatorConfig {
        validateNonEmptyString(target, 'Target');
        validateOptionalString(format, 'Format');
        return createOperator(TRANSFORM_OPERATOR.NOW, { target, format });
    },
};
