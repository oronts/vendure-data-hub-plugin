/**
 * Base Loader Abstract Class
 *
 * Common functionality for all entity loaders to eliminate
 * duplicate code patterns across loader implementations.
 *
 * @module loaders/base
 */

import { ID, RequestContext } from '@vendure/core';
import {
    EntityLoader,
    LoaderContext,
    EntityLoadResult,
    EntityValidationResult,
    EntityFieldSchema,
    InputRecord,
    TargetOperation,
    VendureEntityType,
} from '../../types/index';
import { TARGET_OPERATION, OUTCOME_TYPE, LoaderOutcomeType } from '../../constants/enums';
import { DataHubLogger } from '../../services/logger';
import { isRecoverableError } from '../shared-helpers';

/**
 * Metadata configuration for a loader
 */
export interface LoaderMetadata {
    entityType: VendureEntityType;
    name: string;
    description: string;
    supportedOperations: readonly TargetOperation[];
    lookupFields: readonly string[];
    requiredFields: readonly string[];
}

/**
 * Result from finding an existing entity
 */
export interface ExistingEntityLookupResult<TEntity = unknown> {
    id: ID;
    entity: TEntity;
}

/**
 * Abstract base class for entity loaders.
 *
 * Consolidates the common load() loop pattern used across all loaders:
 * - Validation
 * - Duplicate checking
 * - CREATE/UPDATE/UPSERT logic
 * - Error handling
 * - Result aggregation
 *
 * Subclasses implement entity-specific methods:
 * - findExisting()
 * - validate()
 * - createEntity()
 * - updateEntity()
 * - getFieldSchema()
 * - getDuplicateErrorMessage()
 */
export abstract class BaseEntityLoader<
    TInput extends InputRecord,
    TEntity = unknown,
> implements EntityLoader<TInput>
{
    protected abstract readonly logger: DataHubLogger;
    protected abstract readonly metadata: LoaderMetadata;

    get entityType(): VendureEntityType {
        return this.metadata.entityType;
    }

    get name(): string {
        return this.metadata.name;
    }

    get description(): string {
        return this.metadata.description;
    }

    get supportedOperations(): TargetOperation[] {
        return [...this.metadata.supportedOperations];
    }

    get lookupFields(): string[] {
        return [...this.metadata.lookupFields];
    }

    get requiredFields(): string[] {
        return [...this.metadata.requiredFields];
    }

    /**
     * Main load method - processes records using a standardized loop pattern.
     * This eliminates the duplicate code seen across ProductLoader, CustomerLoader, etc.
     */
    async load(context: LoaderContext, records: TInput[]): Promise<EntityLoadResult> {
        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };

        // Allow subclasses to pre-process/sort records (e.g., CollectionLoader sorts by hierarchy)
        const processedRecords = this.preprocessRecords(records);

        for (const record of processedRecords) {
            try {
                // 1. Validate the record
                const validation = await this.validate(context.ctx, record, context.operation);
                if (!validation.valid) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: validation.errors.map(e => e.message).join('; '),
                        recoverable: false,
                    });
                    continue;
                }

                // 2. Check for existing entity
                const existing = await this.findExisting(context.ctx, context.lookupFields, record);

                // 3. Handle based on operation type and existence
                if (existing) {
                    const outcome = await this.handleExistingEntity(context, record, existing, result);
                    if (outcome === OUTCOME_TYPE.SKIP) continue;
                    if (outcome === OUTCOME_TYPE.ERROR) continue;
                } else {
                    const outcome = await this.handleNewEntity(context, record, result);
                    if (outcome === OUTCOME_TYPE.SKIP) continue;
                    if (outcome === OUTCOME_TYPE.ERROR) continue;
                }

                result.succeeded++;
            } catch (error) {
                this.handleRecordError(error, record, result);
            }
        }

        return result;
    }

    /**
     * Handle an existing entity during load.
     * Returns 'continue' to proceed with success increment, 'skip' to skip, or 'error' on failure.
     */
    private async handleExistingEntity(
        context: LoaderContext,
        record: TInput,
        existing: ExistingEntityLookupResult<TEntity>,
        result: EntityLoadResult,
    ): Promise<LoaderOutcomeType> {
        if (context.operation === TARGET_OPERATION.CREATE) {
            if (context.options.skipDuplicates) {
                result.skipped++;
                return OUTCOME_TYPE.SKIP;
            }
            result.failed++;
            result.errors.push({
                record,
                message: this.getDuplicateErrorMessage(record),
                code: 'DUPLICATE',
                recoverable: false,
            });
            return OUTCOME_TYPE.ERROR;
        }

        // UPDATE or UPSERT - update the existing entity
        if (!context.dryRun) {
            await this.updateEntity(context, existing.id, record);
        }
        result.updated++;
        result.affectedIds.push(existing.id);
        return OUTCOME_TYPE.CONTINUE;
    }

    /**
     * Handle a new entity during load (no existing entity found).
     */
    private async handleNewEntity(
        context: LoaderContext,
        record: TInput,
        result: EntityLoadResult,
    ): Promise<LoaderOutcomeType> {
        if (context.operation === TARGET_OPERATION.UPDATE) {
            result.skipped++;
            return OUTCOME_TYPE.SKIP;
        }

        // CREATE or UPSERT - create new entity
        if (!context.dryRun) {
            const newId = await this.createEntity(context, record);
            if (newId) {
                result.affectedIds.push(newId);
                result.created++;
            } else {
                // Creation returned null (subclass-specific failure)
                result.failed++;
                result.errors.push({
                    record,
                    message: 'Failed to create entity',
                    recoverable: false,
                });
                return OUTCOME_TYPE.ERROR;
            }
        } else {
            result.created++;
        }
        return OUTCOME_TYPE.CONTINUE;
    }

    /**
     * Handle errors during record processing with consistent pattern.
     */
    private handleRecordError(error: unknown, record: TInput, result: EntityLoadResult): void {
        result.failed++;
        result.errors.push({
            record,
            message: error instanceof Error ? error.message : String(error),
            recoverable: isRecoverableError(error),
        });
        this.logger.error(
            `Failed to load ${this.metadata.entityType.toLowerCase()}`,
            error instanceof Error ? error : undefined,
        );
    }

    /**
     * Preprocess records before loading. Override in subclasses for sorting, etc.
     */
    protected preprocessRecords(records: TInput[]): TInput[] {
        return records;
    }

    /**
     * Get error message for duplicate entity. Override for entity-specific messages.
     */
    protected abstract getDuplicateErrorMessage(record: TInput): string;

    /**
     * Create a new entity. Returns the new entity's ID, or null on failure.
     */
    protected abstract createEntity(context: LoaderContext, record: TInput): Promise<ID | null>;

    /**
     * Update an existing entity.
     */
    protected abstract updateEntity(context: LoaderContext, entityId: ID, record: TInput): Promise<void>;

    /**
     * Find existing entity by lookup fields.
     */
    abstract findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: TInput,
    ): Promise<ExistingEntityLookupResult<TEntity> | null>;

    /**
     * Validate a record before loading.
     */
    abstract validate(
        ctx: RequestContext,
        record: TInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult>;

    /**
     * Get field schema for this entity type.
     */
    abstract getFieldSchema(): EntityFieldSchema;
}
