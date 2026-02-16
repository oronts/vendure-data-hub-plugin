/**
 * Transform Types
 *
 * Types for data transformation operations including mapping, filtering,
 * aggregation, and sorting.
 */

/** Type of transformation operation */
export type TransformationType =
    | 'MAP'
    | 'FILTER'
    | 'FORMULA'
    | 'MERGE'
    | 'SPLIT'
    | 'AGGREGATE'
    | 'LOOKUP'
    | 'DEDUPE'
    | 'SORT'
    | 'RENAME'
    | 'TYPECAST'
    | 'TEMPLATE'
    | 'ENRICH'
    | 'VALIDATE'
    | 'SCRIPT';

/**
 * A single transformation step in a pipeline
 */
export interface TransformStep {
    /** Unique identifier for the step */
    id?: string;
    /** Type of transformation to apply */
    type: TransformationType;
    /** Human-readable label for the step */
    label?: string;
    /** Whether the step is enabled */
    enabled?: boolean;
    /** Configuration for the transformation */
    config: Record<string, unknown>;
}

/** Aggregation function type for group operations */
export type AggregationFunction =
    | 'COUNT'
    | 'SUM'
    | 'AVG'
    | 'MIN'
    | 'MAX'
    | 'FIRST'
    | 'LAST'
    | 'CONCAT'
    | 'UNIQUE';

/**
 * Configuration for aggregation operations
 */
export interface AggregationConfig {
    /** Fields to group by */
    groupBy: string[];
    /** Aggregation definitions */
    aggregations: Array<{
        /** Field to aggregate */
        field: string;
        /** Aggregation function to apply */
        function: AggregationFunction;
        /** Output field name */
        alias: string;
    }>;
}

