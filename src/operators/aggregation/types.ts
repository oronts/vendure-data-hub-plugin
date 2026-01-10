import { BaseOperatorConfig } from '../types';

export type AggregationOp = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'first' | 'last';

export interface AggregateOperatorConfig extends BaseOperatorConfig {
    readonly op: AggregationOp;
    readonly source?: string;
    readonly target: string;
    readonly groupBy?: string;
}

export interface CountOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
}

export interface UniqueOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target?: string;
    readonly by?: string;
}

export interface FlattenOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target?: string;
    readonly depth?: number;
}

export interface FirstLastOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
}

export interface ExpandOperatorConfig extends BaseOperatorConfig {
    /** Path to the array to expand */
    readonly path: string;
    /** Whether to merge parent fields into each expanded record */
    readonly mergeParent?: boolean;
    /** Map of parent fields to include: { targetField: sourceFieldPath } */
    readonly parentFields?: Record<string, string>;
}
