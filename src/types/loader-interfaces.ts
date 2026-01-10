/**
 * Entity Loader Interfaces
 *
 * Entity loaders handle CRUD operations for Vendure entities during import.
 * Each entity type has a dedicated loader that knows how to:
 * - Find existing entities by lookup fields
 * - Create new entities
 * - Update existing entities
 * - Handle relationships and nested data
 */

import { ID, RequestContext } from '@vendure/core';
import { TargetOperation, VendureEntityType } from './pipeline';

// Generic record type for input data
export type InputRecord = Record<string, unknown>;

// LOADER CONTEXT

export interface LoaderContext {
    ctx: RequestContext;
    pipelineId: ID;
    runId: ID;
    operation: TargetOperation;
    lookupFields: string[];
    channelIds?: ID[];
    dryRun: boolean;
    options: LoaderOptions;
}

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
    affectedIds: ID[];
}

export interface EntityLoadError {
    record: InputRecord;
    message: string;
    field?: string;
    code?: string;
    recoverable: boolean;
}

// ENTITY LOADER INTERFACE

export interface EntityLoader<TInput extends InputRecord = InputRecord> {
    /** Entity type this loader handles */
    readonly entityType: VendureEntityType;

    /** Human-readable name */
    readonly name: string;

    /** Description of what this loader does */
    readonly description?: string;

    /** Supported operations */
    readonly supportedOperations: TargetOperation[];

    /** Fields that can be used for lookups (find existing) */
    readonly lookupFields: string[];

    /** Required fields for create operation */
    readonly requiredFields: string[];

    /**
     * Load records into Vendure
     * @param context Loader context with operation details
     * @param records Records to load
     * @returns Load result with counts and errors
     */
    load(context: LoaderContext, records: TInput[]): Promise<EntityLoadResult>;

    /**
     * Find existing entity by lookup fields
     * @param ctx Request context
     * @param lookupFields Fields to use for lookup
     * @param record Record with lookup values
     * @returns Entity if found, null otherwise
     */
    findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: TInput,
    ): Promise<{ id: ID; entity: unknown } | null>;

    /**
     * Validate record before loading
     * @param ctx Request context
     * @param record Record to validate
     * @param operation Target operation
     * @returns Validation result
     */
    validate(
        ctx: RequestContext,
        record: TInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult>;

    /**
     * Get field schema for this entity
     * @returns Entity field schema
     */
    getFieldSchema(): EntityFieldSchema;
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

// LOADER REGISTRY

export interface LoaderRegistry {
    /**
     * Register an entity loader
     */
    register(loader: EntityLoader): void;

    /**
     * Get loader for entity type
     */
    get(entityType: VendureEntityType): EntityLoader | undefined;

    /**
     * Get all registered loaders
     */
    getAll(): EntityLoader[];

    /**
     * Check if loader exists for entity type
     */
    has(entityType: VendureEntityType): boolean;
}

