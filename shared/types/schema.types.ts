/**
 * Schema Types - Combined schema validation, field, and definition types
 *
 * Typed schema system for defining complex data structures with validation,
 * transformations, and UI hints.
 */

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface StringValidation {
    minLength?: number;
    maxLength?: number;
    pattern?: string;           // Regex pattern
    patternFlags?: string;      // Regex flags (i, g, m)
    patternMessage?: string;    // Custom error message
    format?: 'email' | 'url' | 'uuid' | 'slug' | 'phone' | 'ip' | 'ipv4' | 'ipv6' | 'hostname' | 'uri';
    trim?: boolean;             // Auto-trim whitespace
    lowercase?: boolean;        // Auto-lowercase
    uppercase?: boolean;        // Auto-uppercase
}

export interface NumberValidation {
    min?: number;
    max?: number;
    exclusiveMin?: number;
    exclusiveMax?: number;
    multipleOf?: number;        // Must be divisible by
    precision?: number;         // Decimal places
    positive?: boolean;
    negative?: boolean;
    integer?: boolean;
}

export interface ArrayValidation {
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;      // No duplicates
    uniqueBy?: string;          // Unique by field (for object arrays)
}

export interface ObjectValidation {
    minProperties?: number;
    maxProperties?: number;
    additionalProperties?: boolean;  // Allow extra fields
}

export interface DateValidation {
    before?: string | 'now';
    after?: string | 'now';
    format?: string;            // Input format for parsing
}

// ============================================================================
// FIELD TYPES
// ============================================================================

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
    transform?: SchemaFieldTransform[];

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

export interface SchemaFieldTransform {
    type: 'trim' | 'lowercase' | 'uppercase' | 'slugify' | 'normalize' | 'round' | 'floor' | 'ceil' | 'abs' | 'parseNumber' | 'parseDate' | 'parseJson' | 'stringify';
    options?: Record<string, unknown>;
}

export interface FieldDependency {
    field: string;
    operator: 'eq' | 'ne' | 'in' | 'notIn' | 'exists' | 'notExists' | 'gt' | 'gte' | 'lt' | 'lte';
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

// ============================================================================
// DEFINITION TYPES
// ============================================================================

export interface EnhancedSchemaDefinition {
    // Meta
    $version?: string;          // Schema version (semver)
    $id?: string;               // Unique schema ID
    $extends?: string;          // Inherit from another schema

    // Fields
    fields: Record<string, EnhancedFieldDefinition>;

    // Field groups for UI organization
    groups?: SchemaFieldGroup[];

    // Primary key field(s) for deduplication/updates
    primaryKey?: string | string[];

    // Indexes for lookup optimization
    indexes?: SchemaIndex[];

    // Cross-field validation rules
    rules?: SchemaValidationRule[];

    // Computed/virtual fields
    computed?: Record<string, ComputedField>;
}

export interface SchemaFieldGroup {
    id: string;
    label: string;
    description?: string;
    collapsed?: boolean;
    fields: string[];
}

export interface SchemaIndex {
    fields: string[];
    unique?: boolean;
    sparse?: boolean;       // Only index non-null values
}

export interface SchemaValidationRule {
    id: string;
    expression: string;     // e.g., "endDate > startDate"
    message: string;
    severity?: 'error' | 'warning';
}

export interface ComputedField {
    type: FieldType;
    expression: string;     // e.g., "price * quantity"
    dependencies: string[]; // Fields this depends on
}
