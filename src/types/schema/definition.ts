/**
 * Schema Definition Types
 */

import { FieldType, EnhancedFieldDefinition } from './field';

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
