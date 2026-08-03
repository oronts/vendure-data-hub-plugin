/**
 * Base Loader Abstract Class
 *
 * Common functionality for all entity loaders to eliminate
 * duplicate code patterns across loader implementations.
 *
 * @module loaders/base
 */

import { ID, RequestContext } from '@vendure/core';
import type {
    EntityLoader,
    LoaderContext,
    EntityLoadResult,
    EntityValidationResult,
    EntityFieldSchema,
    InputRecord,
} from '../../types/loader-interfaces';
import type { TargetOperation, VendureEntityType } from '../../../shared/types';
import { TARGET_OPERATION, OUTCOME_TYPE, LoaderOutcomeType } from '../../constants/enums';
import type { DataHubLogger } from '../../services/logger/datahub-logger';
import { isRecoverableError } from '../error-utils';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';

const UNSUPPORTED_OPERATION_CODE = 'UNSUPPORTED_OPERATION';
const MISSING_ENTITY_CODE = 'NOT_FOUND';

/**
 * Metadata configuration for a loader
 */
export interface LoaderMetadata {
    entityType: VendureEntityType;
    name: string;
    description: string;
    adapterCode: string;
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

export interface LoaderExecutionState {
    readonly caches: Map<string, Map<string, ID>>;
}

export function getLoaderExecutionCache(
    state: LoaderExecutionState | undefined,
    namespace: string,
): Map<string, ID> {
    if (!state) return new Map<string, ID>();
    const existing = state.caches.get(namespace);
    if (existing) return existing;
    const cache = new Map<string, ID>();
    state.caches.set(namespace, cache);
    return cache;
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

    get adapterCode(): string {
        return this.metadata.adapterCode;
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
        if (!this.metadata.supportedOperations.includes(context.operation)) {
            return {
                succeeded: 0,
                failed: records.length,
                created: 0,
                updated: 0,
                skipped: 0,
                errors: records.map(record => ({
                    record,
                    message: `Operation ${context.operation} is not supported for ${this.metadata.entityType}`,
                    code: UNSUPPORTED_OPERATION_CODE,
                    recoverable: false,
                })),
                affectedIds: [],
            };
        }

        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };
        const executionState: LoaderExecutionState = {
            caches: new Map(),
        };

        // Allow subclasses to pre-process/sort records (e.g., CollectionLoader sorts by hierarchy)
        const processedRecords = this.preprocessRecords(records, executionState);

        for (const record of processedRecords) {
            try {
                // 1. Validate the record
                const validation = await this.validate(
                    context.ctx,
                    record,
                    context.operation,
                    executionState,
                );
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
                const existing = await this.findExisting(
                    context.ctx,
                    context.lookupFields,
                    record,
                    executionState,
                );

                // 3. Handle based on operation type and existence
                if (existing) {
                    const outcome = await this.handleExistingEntity(
                        context,
                        record,
                        existing,
                        result,
                        executionState,
                    );
                    if (outcome === OUTCOME_TYPE.SKIP) continue;
                    if (outcome === OUTCOME_TYPE.ERROR) continue;
                } else {
                    const outcome = await this.handleNewEntity(
                        context,
                        record,
                        result,
                        executionState,
                    );
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
     * Returns CONTINUE to proceed with success increment, SKIP to skip, or ERROR on failure.
     */
    private async handleExistingEntity(
        context: LoaderContext,
        record: TInput,
        existing: ExistingEntityLookupResult<TEntity>,
        result: EntityLoadResult,
        executionState: LoaderExecutionState,
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
            await this.updateEntity(context, existing.id, record, executionState);
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
        executionState: LoaderExecutionState,
    ): Promise<LoaderOutcomeType> {
        if (context.operation === TARGET_OPERATION.UPDATE) {
            result.failed++;
            result.errors.push({
                record,
                message: `Cannot update missing ${this.metadata.entityType} entity`,
                code: MISSING_ENTITY_CODE,
                recoverable: false,
            });
            return OUTCOME_TYPE.ERROR;
        }

        // CREATE or UPSERT - create new entity
        if (!context.dryRun) {
            const newId = await this.createEntity(context, record, executionState);
            if (newId) {
                result.affectedIds.push(newId);
                result.created++;
            } else {
                // Creation returned null (subclass-specific failure)
                result.failed++;
                result.errors.push({
                    record,
                    message: `Failed to create ${this.metadata.entityType} entity`,
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
            message: getErrorMessage(error),
            recoverable: isRecoverableError(error),
        });
        this.logger.error(
            `Failed to load ${this.metadata.entityType.toLowerCase()}`,
            toErrorOrUndefined(error),
        );
    }

    /**
     * Preprocess records before loading. Override in subclasses for sorting, etc.
     */
    protected preprocessRecords(
        records: TInput[],
        _executionState?: LoaderExecutionState,
    ): TInput[] {
        return records;
    }

    /**
     * Get error message for duplicate entity. Override for entity-specific messages.
     */
    protected abstract getDuplicateErrorMessage(record: TInput): string;

    /**
     * Create a new entity. Returns the new entity's ID, or null on failure.
     */
    protected abstract createEntity(
        context: LoaderContext,
        record: TInput,
        executionState?: LoaderExecutionState,
    ): Promise<ID | null>;

    /**
     * Update an existing entity.
     */
    protected abstract updateEntity(
        context: LoaderContext,
        entityId: ID,
        record: TInput,
        executionState?: LoaderExecutionState,
    ): Promise<void>;

    /**
     * Find existing entity by lookup fields.
     */
    abstract findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: TInput,
        executionState?: LoaderExecutionState,
    ): Promise<ExistingEntityLookupResult<TEntity> | null>;

    /**
     * Validate a record before loading.
     */
    abstract validate(
        ctx: RequestContext,
        record: TInput,
        operation: TargetOperation,
        executionState?: LoaderExecutionState,
    ): Promise<EntityValidationResult>;

    /**
     * Get field schema for this entity type.
     */
    abstract getFieldSchema(): EntityFieldSchema;
}
