/**
 * Entity Loader Types - Shared type definitions for data loading
 *
 * These types define configuration and results for entity loaders.
 * Backend-specific interfaces that use @vendure/core remain in src/types.
 */

import type { VendureEntityType } from './pipeline.types';

// Generic record type for input data
export type InputRecord = Record<string, unknown>;

// LOADER OPTIONS

export interface LoaderOptions {
    /** Publish changes immediately */
    publishChanges?: boolean;
    /** Only update these fields (for UPDATE operation) */
    updateOnlyFields?: string[];
    /** Only set these fields on create (for UPSERT) */
    createOnlyFields?: string[];
    /** Skip if entity already exists */
    skipDuplicates?: boolean;
    /** Language code for translations */
    languageCode?: string;
}

// LOAD RESULT (Entity-specific, distinct from pipeline LoadResult)

export interface EntityLoadResult {
    succeeded: number;
    failed: number;
    created: number;
    updated: number;
    skipped: number;
    errors: EntityLoadError[];
    affectedIds: (string | number)[];
}

export interface EntityLoadError {
    record: InputRecord;
    message: string;
    field?: string;
    code?: string;
    recoverable: boolean;
}

// VALIDATION (Entity-specific, distinct from pipeline ValidationResult)

export interface EntityValidationResult {
    valid: boolean;
    errors: EntityValidationError[];
    warnings: EntityValidationWarning[];
}

export interface EntityValidationError {
    field: string;
    message: string;
    code?: string;
}

export interface EntityValidationWarning {
    field: string;
    message: string;
}

// FIELD SCHEMA

export interface EntityFieldSchema {
    entityType: VendureEntityType;
    fields: EntityField[];
}

/** Supported field types for entity schemas */
export type EntityFieldType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'date'
    | 'array'
    | 'object'
    | 'relation'
    | 'asset'
    | 'money'
    | 'localized-string'
    | 'id'
    | 'enum'
    | 'json';

export interface EntityField {
    /** Field key/path */
    key: string;
    /** Human-readable label */
    label: string;
    /** Field type */
    type: EntityFieldType;
    /** Is this field required? */
    required?: boolean;
    /** Is this field read-only? */
    readonly?: boolean;
    /** Can be used for lookup? */
    lookupable?: boolean;
    /** Is this field translatable? */
    translatable?: boolean;
    /** Related entity type (for relations) */
    relatedEntity?: VendureEntityType;
    /** Nested fields (for objects) */
    children?: EntityField[];
    /** Description/help text */
    description?: string;
    /** Example value */
    example?: unknown;
    /** Validation rules */
    validation?: {
        minLength?: number;
        maxLength?: number;
        min?: number;
        max?: number;
        pattern?: string;
        enum?: unknown[];
    };
}
