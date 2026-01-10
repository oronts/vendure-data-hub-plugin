import { JsonValue, BaseOperatorConfig } from '../types';

export interface LookupOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly map: Record<string, JsonValue>;
    readonly target: string;
    readonly default?: JsonValue;
}

export interface EnrichOperatorConfig extends BaseOperatorConfig {
    readonly set?: Record<string, JsonValue>;
    readonly defaults?: Record<string, JsonValue>;
}

export interface CoalesceOperatorConfig extends BaseOperatorConfig {
    readonly paths: string[];
    readonly target: string;
    readonly default?: JsonValue;
}

export interface DefaultOperatorConfig extends BaseOperatorConfig {
    readonly path: string;
    readonly value: JsonValue;
}
