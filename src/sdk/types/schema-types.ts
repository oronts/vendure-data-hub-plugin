/**
 * Schema Types - SDK types for schema definitions and field configurations
 *
 * These types are used for auto-generating UI forms and validating adapter configurations.
 *
 * @module sdk/types/schema-types
 */

import { JsonValue } from '../../types/index';
import type { SchemaFieldType } from '../../../shared/types/adapter.types';

// Re-export SchemaFieldType from shared types (canonical source)
export type { SchemaFieldType };

/**
 * Option for select/multiselect fields
 */
export interface SelectOption {
    /** The value stored when this option is selected */
    readonly value: string;
    /** Display label shown in the UI */
    readonly label: string;
    /** Optional description for tooltip/help text */
    readonly description?: string;
}

/**
 * Field validation rules
 */
export interface FieldValidation {
    /** Minimum value for number fields */
    readonly min?: number;
    /** Maximum value for number fields */
    readonly max?: number;
    /** Minimum length for string fields */
    readonly minLength?: number;
    /** Maximum length for string fields */
    readonly maxLength?: number;
    /** Regular expression pattern for validation */
    readonly pattern?: string;
    /** Custom error message when pattern validation fails */
    readonly patternMessage?: string;
}

/**
 * Field dependency configuration for conditional visibility
 */
export interface FieldDependency {
    /** The field key this field depends on */
    readonly field: string;
    /** The value that triggers this dependency */
    readonly value: JsonValue;
    readonly operator?: 'eq' | 'ne' | 'in' | 'notIn';
}

/**
 * Schema field definition for step/adapter configuration
 */
export interface StepConfigSchemaField {
    /** Unique key for this field in the configuration */
    readonly key: string;
    /** Display label for the field */
    readonly label?: string;
    /** Help text description */
    readonly description?: string;
    /** Field type determining UI rendering */
    readonly type: SchemaFieldType;
    /** Whether the field is required */
    readonly required?: boolean;
    /** Available options for select/multiselect fields */
    readonly options?: readonly SelectOption[];
    /** Default value when creating new configuration */
    readonly defaultValue?: JsonValue;
    /** Placeholder text for input fields */
    readonly placeholder?: string;
    /** Validation rules for the field */
    readonly validation?: FieldValidation;
    /** Conditional visibility based on other fields */
    readonly dependsOn?: FieldDependency;
    /** Group ID for organizing related fields in UI */
    readonly group?: string;
}

/**
 * Complete schema definition for step/adapter configuration
 */
export interface StepConfigSchema {
    /** List of field definitions */
    readonly fields: readonly StepConfigSchemaField[];
    /** Optional field groups for UI organization */
    readonly groups?: readonly SchemaFieldGroup[];
}

/**
 * Field group for organizing related fields in the UI
 */
export interface SchemaFieldGroup {
    /** Unique group identifier */
    readonly id: string;
    /** Display label for the group */
    readonly label: string;
    /** Optional description for the group */
    readonly description?: string;
    /** Whether the group should be initially collapsed */
    readonly collapsed?: boolean;
}
