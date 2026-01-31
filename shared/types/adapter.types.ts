/**
 * Adapter Types
 *
 * This module defines types for pipeline adapters (extractors, operators, loaders, etc.)
 */

import { JsonValue } from './json.types';

/**
 * Types of adapters available in the pipeline system
 *
 * Uses lowercase as these are internal type identifiers, not GraphQL enums
 */
export type AdapterType =
    | 'extractor'
    | 'operator'
    | 'loader'
    | 'validator'
    | 'enricher'
    | 'exporter'
    | 'feed'
    | 'sink'
    | 'trigger'
    | 'router';

/**
 * Categories for organizing adapters in the UI
 *
 * Uses kebab-case as these are display/organization identifiers
 */
export type AdapterCategory =
    | 'data-source'
    | 'transformation'
    | 'filtering'
    | 'enrichment'
    | 'aggregation'
    | 'conversion'
    | 'catalog'
    | 'customers'
    | 'orders'
    | 'inventory'
    | 'promotions'
    | 'assets'
    | 'external'
    | 'utility';

/**
 * Field types for adapter configuration schema
 *
 * Uses SCREAMING_SNAKE_CASE as these are UI widget type identifiers
 */
export type SchemaFieldType =
    | 'STRING'
    | 'NUMBER'
    | 'BOOLEAN'
    | 'SELECT'
    | 'MULTISELECT'
    | 'JSON'
    | 'CODE'
    | 'TEXTAREA'
    | 'PASSWORD'
    | 'SECRET'
    | 'CONNECTION'
    | 'ENTITY'
    | 'FIELD'
    | 'CRON'
    | 'DATE'
    | 'DATETIME'
    | 'FILE'
    | 'URL'
    | 'EMAIL'
    | 'ARRAY'
    | 'OBJECT'
    | 'MAPPING'
    | 'EXPRESSION';

/**
 * Operators for field dependency conditions
 *
 * Uses camelCase as per naming convention for operators
 */
export type DependsOnOperator = 'eq' | 'ne' | 'in' | 'exists';

/**
 * Option for select/multiselect fields
 */
export interface SelectOption {
    /** Value stored in configuration */
    value: string;
    /** Human-readable label for display */
    label: string;
    /** Additional description for the option */
    description?: string;
    /** Icon identifier for the option */
    icon?: string;
}

/**
 * Schema field definition for adapter configuration UI
 */
export interface AdapterSchemaField {
    /** Unique key for the field */
    key: string;
    /** Human-readable label */
    label?: string;
    /** Help text description */
    description?: string;
    /** Field type determining the UI widget */
    type: SchemaFieldType;
    /** Whether the field is required */
    required?: boolean;
    /** Default value */
    default?: JsonValue;
    /** Options for select/multiselect fields */
    options?: SelectOption[];
    /** Placeholder text for input fields */
    placeholder?: string;
    /** Validation rules */
    validation?: {
        /** Minimum numeric value */
        min?: number;
        /** Maximum numeric value */
        max?: number;
        /** Minimum string length */
        minLength?: number;
        /** Maximum string length */
        maxLength?: number;
        /** Regex pattern for validation */
        pattern?: string;
        /** Custom error message for pattern mismatch */
        patternMessage?: string;
    };
    /** Conditional visibility based on another field's value */
    dependsOn?: {
        /** Field key to check */
        field: string;
        /** Value to compare against */
        value?: JsonValue;
        /** Comparison operator */
        operator?: DependsOnOperator;
    };
    /** Group key for field organization */
    group?: string;
    /** Whether field is in advanced section */
    advanced?: boolean;
    /** Whether field is hidden from UI */
    hidden?: boolean;
}

/**
 * Schema definition for adapter configuration
 */
export interface AdapterSchema {
    /** Field definitions */
    fields: AdapterSchemaField[];
    /** Field groups for UI organization */
    groups?: Array<{
        /** Unique group key */
        key: string;
        /** Human-readable label */
        label: string;
        /** Group description */
        description?: string;
        /** Whether group is collapsed by default */
        collapsed?: boolean;
    }>;
}

/**
 * Complete adapter definition including metadata and schema
 */
export interface AdapterDefinition {
    /** Type of adapter */
    type: AdapterType;
    /** Unique code identifier */
    code: string;
    /** Human-readable name */
    name: string;
    /** Description of the adapter */
    description?: string;
    /** Category for organization */
    category?: AdapterCategory | string;
    /** Icon identifier */
    icon?: string;
    /** Color for UI display */
    color?: string;
    /** Configuration schema */
    schema: AdapterSchema;
    /** Whether adapter is pure (no side effects) */
    pure?: boolean;
    /** Whether adapter is async */
    async?: boolean;
    /** Whether adapter supports batch processing */
    batchable?: boolean;
    /** Whether adapter is deprecated */
    deprecated?: boolean;
    /** Whether adapter is experimental */
    experimental?: boolean;
    /** Tags for filtering/search */
    tags?: string[];
}
