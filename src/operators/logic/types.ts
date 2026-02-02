import { JsonValue, BaseOperatorConfig, OperatorCondition } from '../types';

export interface WhenOperatorConfig extends BaseOperatorConfig {
    readonly conditions: OperatorCondition[];
    readonly action: 'keep' | 'drop';
}

export interface IfThenElseOperatorConfig extends BaseOperatorConfig {
    readonly condition: OperatorCondition;
    readonly thenValue: JsonValue;
    readonly elseValue?: JsonValue;
    readonly target: string;
}

export interface SwitchCase {
    readonly value: JsonValue;
    readonly result: JsonValue;
}

export interface SwitchOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly cases: SwitchCase[];
    readonly default?: JsonValue;
    readonly target: string;
}

export interface DeltaFilterOperatorConfig extends BaseOperatorConfig {
    readonly idPath: string;
    readonly includePaths?: string[];
    readonly excludePaths?: string[];
}
