/**
 * Schema Validation Types
 */

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
