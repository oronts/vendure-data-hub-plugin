import type { JsonValue } from '../../types/index';
import type { OperatorConfig, RouteConditionConfig } from './step-configs';
import type { OperatorCondition } from '../../operators/types';
import type { HttpLookupOperatorConfig } from '../../operators/enrichment/types';
import { TRANSFORM_OPERATOR } from '../constants';
import { validateHttpLookupConfig } from '../../operators/enrichment/http-lookup-security';
import { validateNonEmptyString } from './validation-helpers';
import {
    createOperator,
    validateOptionalString,
    validateStringArray,
} from './transform-builder.helpers';

type HttpLookupOptions = Omit<HttpLookupOperatorConfig, 'url' | 'target' | 'skipNull'>;

function validateCondition(
    condition: Pick<OperatorCondition, 'field'>,
    fieldName: string,
): void {
    if (!condition || typeof condition !== 'object') {
        throw new Error(`${fieldName} must be an object`);
    }
    validateNonEmptyString(condition.field, `${fieldName} field`);
}

export const controlTransformOperators = {
    when(
        conditions: RouteConditionConfig[],
        action: 'keep' | 'drop' = 'keep',
    ): OperatorConfig {
        if (!Array.isArray(conditions) || conditions.length === 0) {
            throw new Error('Conditions must be a non-empty array');
        }
        conditions.forEach((condition, index) => {
            validateCondition(condition, `Conditions[${index}]`);
        });
        return createOperator(TRANSFORM_OPERATOR.WHEN, { conditions, action });
    },

    filter(condition: RouteConditionConfig): OperatorConfig {
        validateCondition(condition, 'Condition');
        return createOperator(TRANSFORM_OPERATOR.WHEN, {
            conditions: [condition],
            action: 'keep',
        });
    },

    ifThenElse(
        condition: OperatorCondition,
        thenValue: JsonValue,
        elseValue: JsonValue | undefined,
        target: string,
    ): OperatorConfig {
        validateCondition(condition, 'Condition');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.IF_THEN_ELSE, {
            condition,
            thenValue,
            elseValue,
            target,
        });
    },

    switch(
        source: string,
        cases: Array<{ value: JsonValue; result: JsonValue }>,
        target: string,
        defaultValue?: JsonValue,
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        if (!Array.isArray(cases) || cases.length === 0) {
            throw new Error('Cases must be a non-empty array');
        }
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.SWITCH, {
            source,
            cases,
            target,
            default: defaultValue,
        });
    },

    deltaFilter(
        idPath: string,
        includePaths?: string[],
        excludePaths?: string[],
    ): OperatorConfig {
        validateNonEmptyString(idPath, 'ID path');
        if (includePaths !== undefined) {
            validateStringArray(includePaths, 'Include paths');
        }
        if (excludePaths !== undefined) {
            validateStringArray(excludePaths, 'Exclude paths');
        }
        return createOperator(TRANSFORM_OPERATOR.DELTA_FILTER, {
            idPath,
            includePaths,
            excludePaths,
        });
    },

    parseJson(source: string, target?: string): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateOptionalString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.PARSE_JSON, { source, target });
    },

    stringifyJson(source: string, target?: string, pretty = false): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateOptionalString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.STRINGIFY_JSON, {
            source,
            target,
            pretty,
        });
    },

    pick(fields: string[]): OperatorConfig {
        validateStringArray(fields, 'Fields');
        return createOperator(TRANSFORM_OPERATOR.PICK, { fields });
    },

    omit(fields: string[]): OperatorConfig {
        validateStringArray(fields, 'Fields');
        return createOperator(TRANSFORM_OPERATOR.OMIT, { fields });
    },

    lookup(
        source: string,
        map: Record<string, JsonValue>,
        target: string,
        defaultValue?: JsonValue,
    ): OperatorConfig {
        validateNonEmptyString(source, 'Source');
        validateNonEmptyString(target, 'Target');
        if (!map || typeof map !== 'object' || Array.isArray(map)) {
            throw new Error('Lookup map must be an object');
        }
        return createOperator(TRANSFORM_OPERATOR.LOOKUP, {
            source,
            map,
            target,
            default: defaultValue,
        });
    },

    coalesce(paths: string[], target: string, defaultValue?: JsonValue): OperatorConfig {
        validateStringArray(paths, 'Paths');
        validateNonEmptyString(target, 'Target');
        return createOperator(TRANSFORM_OPERATOR.COALESCE, {
            paths,
            target,
            default: defaultValue,
        });
    },

    enrich(config: {
        set?: Record<string, JsonValue>;
        defaults?: Record<string, JsonValue>;
    }): OperatorConfig {
        return createOperator(TRANSFORM_OPERATOR.ENRICH, config);
    },

    defaults(fields: Record<string, JsonValue>): OperatorConfig {
        return createOperator(TRANSFORM_OPERATOR.ENRICH, { defaults: fields });
    },

    default(path: string, value: JsonValue): OperatorConfig {
        validateNonEmptyString(path, 'Path');
        return createOperator(TRANSFORM_OPERATOR.DEFAULT, { path, value });
    },

    httpLookup(
        url: string,
        target: string,
        options?: HttpLookupOptions,
    ): OperatorConfig {
        validateNonEmptyString(url, 'URL');
        validateNonEmptyString(target, 'Target');
        const config: HttpLookupOperatorConfig = { url, target, ...options };
        validateHttpLookupConfig(config);
        return createOperator(TRANSFORM_OPERATOR.HTTP_LOOKUP, { ...config });
    },
};
