import { ID, RequestContext } from '@vendure/core';
import {
    TargetOperation,
    VendureEntityType,
    InputRecord,
    LoaderOptions,
    EntityLoadResult,
    EntityValidationResult,
    EntityFieldSchema,
} from '../../shared/types';

export type {
    InputRecord,
    LoaderOptions,
    EntityLoadResult,
    EntityLoadError,
    EntityValidationResult,
    EntityValidationError,
    EntityValidationWarning,
    EntityFieldSchema,
    EntityFieldType,
    EntityField,
} from '../../shared/types';

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
