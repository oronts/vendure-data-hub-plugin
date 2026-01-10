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

/**
 * Configuration for coalesce operator - returns first non-null value from multiple fields.
 */
export interface CoalesceOperatorConfig extends BaseOperatorConfig {
    /** Array of field paths to check in order */
    readonly sources: string[];
    /** Target field path for the result */
    readonly target: string;
    /** Default value if all sources are null/undefined */
    readonly default?: JsonValue;
}

/**
 * A mapping entry for the lookup operator.
 */
export interface LookupMapping {
    /** The key to match against */
    readonly key: JsonValue;
    /** The value to return when matched */
    readonly value: JsonValue;
}

/**
 * Configuration for lookup operator - maps values using a static lookup table.
 */
export interface LookupOperatorConfig extends BaseOperatorConfig {
    /** Source field path containing the value to look up */
    readonly source: string;
    /** Target field path for the result */
    readonly target: string;
    /** Array of key-value mappings */
    readonly mappings: LookupMapping[];
    /** Default value if no mapping matches */
    readonly default?: JsonValue;
    /** Whether to perform case-insensitive matching (for string keys) */
    readonly caseInsensitive?: boolean;
}
