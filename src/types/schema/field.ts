/**
 * Schema Field Types
 */

// PRIMITIVE TYPES

export type PrimitiveType =
    | 'string'
    | 'text'          // Long text / textarea
    | 'number'
    | 'integer'
    | 'float'
    | 'decimal'       // Exact decimal (for prices)
    | 'boolean'
    | 'date'          // Date only (YYYY-MM-DD)
    | 'datetime'      // Full ISO datetime
    | 'time'          // Time only (HH:mm:ss)
    | 'timestamp'     // Unix timestamp
    | 'email'
    | 'url'
    | 'uuid'
    | 'slug'
    | 'phone'
    | 'currency'      // Currency code (USD, EUR)
    | 'locale'        // Locale code (en-US)
    | 'country'       // ISO country code
    | 'json'          // Raw JSON (any structure)
    | 'binary'        // Base64 encoded
    | 'null';

// COMPLEX TYPES

export type ComplexType =
    | 'object'        // Nested object with sub-fields
    | 'array'         // Array with item type
    | 'map'           // Key-value map (Record<string, T>)
    | 'tuple'         // Fixed-length array with specific types
    | 'union'         // One of multiple types
    | 'enum'          // Enumeration of values
    | 'ref';          // Reference to another schema

export type FieldType = PrimitiveType | ComplexType;

// FIELD DEFINITION

export interface EnhancedFieldDefinition {
    // Core
    type: FieldType;
    required?: boolean;
    nullable?: boolean;
    readonly?: boolean;

    // Documentation
    label?: string;
    description?: string;
    example?: unknown;
    deprecated?: boolean;
    deprecatedMessage?: string;

    // Default & Transform
    default?: unknown;
    defaultExpression?: string;     // Dynamic default: "now()", "uuid()"
    transform?: FieldTransform[];   // Pre-processing transforms

    // Validation (type-specific)
    validation?: StringValidation | NumberValidation | ArrayValidation | ObjectValidation | DateValidation;

    // For 'object' type - nested fields
    fields?: Record<string, EnhancedFieldDefinition>;

    // For 'array' type - item definition
    items?: EnhancedFieldDefinition;

    // For 'map' type - value definition (keys are always strings)
    values?: EnhancedFieldDefinition;

    // For 'tuple' type - ordered item definitions
    elements?: EnhancedFieldDefinition[];

    // For 'union' type - allowed types
    oneOf?: EnhancedFieldDefinition[];

    // For 'enum' type - allowed values
    enum?: Array<string | number | boolean>;
    enumLabels?: Record<string, string>;  // Human-readable labels

    // For 'ref' type - reference to another schema
    ref?: string;  // Schema code

    // For 'decimal'/'currency' type
    precision?: number;
    scale?: number;
    currencyField?: string;  // Field containing currency code

    // Conditional
    dependsOn?: FieldDependency[];

    // UI hints
    ui?: FieldUIHints;
}

export interface FieldTransform {
    type: 'trim' | 'lowercase' | 'uppercase' | 'slugify' | 'normalize' | 'round' | 'floor' | 'ceil' | 'abs' | 'parseNumber' | 'parseDate' | 'parseJson' | 'stringify';
    options?: Record<string, unknown>;
}

export interface FieldDependency {
    field: string;
    operator: 'eq' | 'neq' | 'in' | 'notIn' | 'exists' | 'notExists' | 'gt' | 'gte' | 'lt' | 'lte';
    value?: unknown;
}

export interface FieldUIHints {
    widget?: 'input' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'radio' | 'switch' | 'datepicker' | 'colorpicker' | 'slider' | 'code' | 'json' | 'password' | 'file' | 'image' | 'rich-text';
    placeholder?: string;
    helpText?: string;
    group?: string;
    order?: number;
    hidden?: boolean;
    disabled?: boolean;
    width?: 'full' | 'half' | 'third' | 'quarter';
    rows?: number;          // For textarea
    language?: string;      // For code editor
}

import { StringValidation, NumberValidation, ArrayValidation, ObjectValidation, DateValidation } from './validation';
