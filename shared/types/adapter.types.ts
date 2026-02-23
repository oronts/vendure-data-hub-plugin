/**
 * Adapter Types
 *
 * Types for pipeline adapters (extractors, operators, loaders, etc.)
 */

import { JsonValue } from './json.types';

/**
 * Types of adapters available in the pipeline system
 */
export type AdapterType =
    | 'EXTRACTOR'
    | 'OPERATOR'
    | 'LOADER'
    | 'VALIDATOR'
    | 'ENRICHER'
    | 'EXPORTER'
    | 'FEED'
    | 'SINK'
    | 'TRIGGER'
    | 'ROUTER';

/**
 * Categories for organizing adapters in the UI
 */
export type AdapterCategory =
    | 'DATA_SOURCE'
    | 'TRANSFORMATION'
    | 'FILTERING'
    | 'ENRICHMENT'
    | 'AGGREGATION'
    | 'CONVERSION'
    | 'CATALOG'
    | 'CUSTOMERS'
    | 'ORDERS'
    | 'INVENTORY'
    | 'PROMOTIONS'
    | 'ASSETS'
    | 'EXTERNAL'
    | 'UTILITY';

/**
 * Field types for adapter configuration schema
 *
 * Uses lowercase values as these represent HTML input types and schema primitives.
 */
export type SchemaFieldType =
    | 'string'      // Single-line text input
    | 'number'      // Numeric input
    | 'boolean'     // Checkbox/toggle
    | 'select'      // Single-select dropdown
    | 'multiselect' // Multi-select dropdown
    | 'json'        // JSON editor
    | 'code'        // Code editor with syntax highlighting
    | 'textarea'    // Multi-line text input
    | 'password'    // Password input (masked)
    | 'secret'      // Secret reference picker
    | 'connection'  // Connection reference picker
    | 'entity'      // Entity reference picker
    | 'field'       // Field selector
    | 'cron'        // Cron expression input
    | 'date'        // Date picker
    | 'datetime'    // Date and time picker
    | 'file'        // File upload input
    | 'url'         // URL input with validation
    | 'email'       // Email input with validation
    | 'array'       // Array/list editor
    | 'object'      // Object/map editor
    | 'mapping'     // Field mapping editor
    | 'expression'; // Expression editor

/**
 * Operators for field dependency conditions
 *
 * Values are lowercase abbreviations (serialized to DB, changing requires migration)
 */
export type DependsOnOperator = 'eq' | 'ne' | 'in' | 'exists';

/**
 * Option for select/multiselect fields
 *
 * @see AdapterSchemaField — uses SelectOption[] in its `options` property
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
 * Shared AdapterDefinition - mutable format for pipeline definitions and API
 * serialization. Used in the shared layer for describing adapter metadata.
 *
 * Parallel definition exists in src/sdk/types/adapter-types.ts with a different
 * shape: all readonly fields, optional `name`, uses StepConfigSchema instead of
 * AdapterSchema, and includes SDK-specific fields (requires, version,
 * deprecatedMessage, experimentalMessage). The SDK version is the immutable
 * contract for custom adapter registration.
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
    /** For loaders: the Vendure entity type this loader handles */
    entityType?: string;
    /** For exporters/feeds: the base output file format */
    formatType?: string;
    /** For loaders: fields that can be patched during error retry */
    patchableFields?: string[];
    /** For operators: which custom editor to use in the UI */
    editorType?: string;
    /** For operators: template string for config summary display */
    summaryTemplate?: string;
    /** Human-readable category label for UI display (e.g. "String", "Numeric") */
    categoryLabel?: string;
    /** Sort order for category display in the UI (lower = first) */
    categoryOrder?: number;
    /** Whether this adapter should be hidden from wizard UIs */
    wizardHidden?: boolean;
    /** Whether this adapter is built-in (shipped with the plugin) vs custom (registered via SDK/connectors) */
    builtIn?: boolean;
}
