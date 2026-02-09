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

/**
 * Configuration for a computed formula field
 */
export interface FormulaField {
    /** Output field name */
    name: string;
    /** Formula expression to evaluate */
    expression: string;
    /** Whether to overwrite existing field */
    overwrite?: boolean;
}

/** Sort direction for ordering */
export type SortDirection = 'ASC' | 'DESC';

/** Position of null values in sort order */
export type NullsPosition = 'FIRST' | 'LAST';

/**
 * Configuration for sorting operations
 */
export interface SortConfig {
    /** Sort criteria in priority order */
    sortBy: Array<{
        /** Field to sort by */
        field: string;
        /** Sort direction */
        direction: SortDirection;
        /** Position of null values */
        nulls?: NullsPosition;
    }>;
}

/** Strategy for handling duplicates */
export type DedupeStrategy = 'FIRST' | 'LAST' | 'MERGE';

/**
 * Configuration for deduplication operations
 */
export interface DedupeConfig {
    /** Fields to use for identifying duplicates */
    keys: string[];
    /** Strategy for handling duplicates */
    strategy: DedupeStrategy;
    /** Whether to ignore case when comparing keys */
    caseInsensitive?: boolean;
}

/**
 * Configuration for lookup/mapping operations
 */
export interface LookupConfig {
    /** Source field to look up */
    source: string;
    /** Target field to populate */
    target: string;
    /** Lookup mapping table */
    map: Record<string, unknown>;
    /** Default value if lookup fails */
    default?: unknown;
}

/**
 * Configuration for template-based string generation
 */
export interface TemplateConfig {
    /** Template string with placeholders */
    template: string;
    /** Target field to store result */
    target: string;
    /** Treat missing fields as empty strings */
    missingAsEmpty?: boolean;
}

/**
 * Configuration for splitting a field into multiple values
 */
export interface SplitConfig {
    /** Source field to split */
    field: string;
    /** Delimiter to split on */
    delimiter?: string;
    /** Regex pattern to split on */
    pattern?: string;
    /** Target field for split result */
    target?: string;
}
