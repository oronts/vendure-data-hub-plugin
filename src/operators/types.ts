import { JsonValue, JsonObject } from '../types';
import { RouteConditionOperator } from '../constants/index';
import { AdapterDefinition, OperatorHelpers } from '../sdk/types';

export interface OperatorResult {
    readonly records: JsonObject[];
    readonly dropped?: number;
    readonly errors?: OperatorError[];
    readonly meta?: JsonObject;
}

export interface OperatorError {
    readonly message: string;
    readonly field?: string;
    readonly index?: number;
    readonly cause?: Error;
}

export interface BaseOperatorConfig {
    readonly skipNull?: boolean;
    readonly failOnError?: boolean;
}

export interface FieldPathConfig extends BaseOperatorConfig {
    readonly source?: string;
    readonly target?: string;
    readonly path?: string;
}

export type ComparisonOperator =
    | RouteConditionOperator
    | 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte'
    | 'in' | 'notIn' | 'contains' | 'notContains'
    | 'startsWith' | 'endsWith' | 'regex'
    | 'exists' | 'isNull';

export interface OperatorCondition {
    readonly field: string;
    readonly cmp: ComparisonOperator;
    readonly value?: JsonValue;
}

export type SingleRecordOperatorFn<TConfig = JsonObject> = (
    record: JsonObject,
    config: TConfig,
    helpers: OperatorHelpers,
) => Promise<JsonObject | null> | JsonObject | null;

export type BatchOperatorFn<TConfig = JsonObject> = (
    records: readonly JsonObject[],
    config: TConfig,
    helpers: OperatorHelpers,
) => Promise<OperatorResult> | OperatorResult;

export { RouteConditionOperator } from '../constants/index';
export type { AdapterDefinition, OperatorHelpers } from '../sdk/types';
export type { JsonValue, JsonObject } from '../types';
