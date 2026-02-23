import type { JoinType } from '../../../shared/types';
import { BaseOperatorConfig, JsonObject } from '../types';

export type { JoinType };

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

export interface MultiJoinOperatorConfig extends BaseOperatorConfig {
    /** Field path in left (primary) records to join on */
    readonly leftKey: string;
    /** Field path in right records to join on */
    readonly rightKey: string;
    /** Static right-side dataset provided inline */
    readonly rightData?: JsonObject[];
    /** Dot-path to right-side data from pipeline context */
    readonly rightDataPath?: string;
    /** Join type: INNER, LEFT, RIGHT, or FULL (default: LEFT) */
    readonly type?: JoinType;
    /** Prefix for right-side field names to avoid collisions */
    readonly prefix?: string;
    /** Which right-side fields to include (default: all) */
    readonly select?: string[];
}
