/**
 * Entity Lookup Helper
 *
 * Common entity lookup patterns used across all loaders.
 * Consolidates the duplicate findExisting() logic.
 *
 * @module loaders/base
 */

import {
    ID,
    RequestContext,
    TransactionalConnection,
    VendureEntity,
} from '@vendure/core';
import type { Type } from '@vendure/common/lib/shared-types';
import { getNestedValue } from '../../../shared/utils/object-path';

/**
 * Strategy for looking up entities
 */
export interface LookupStrategy<TService, TEntity> {
    /** Field name to check in lookup fields list */
    fieldName: string;
    /**
     * Function to look up entity
     * @returns Entity with id property, or null if not found
     */
    lookup: (
        ctx: RequestContext,
        service: TService,
        value: unknown,
    ) => Promise<{ id: ID; entity?: TEntity } | null>;
}

/**
 * Helper class for entity lookups with multiple strategies
 */
export class EntityLookupHelper<TService, TEntity, TInput> {
    private strategies: LookupStrategy<TService, TEntity>[] = [];

    constructor(private service: TService) {}

    /**
     * Add a lookup strategy based on a filter query
     */
    addFilterStrategy(
        fieldName: string,
        filterField: string,
        findAllFn: (
            ctx: RequestContext,
            service: TService,
            options: { filter: Record<string, { eq: unknown }> },
        ) => Promise<{ totalItems: number; items: Array<{ id: ID } & Partial<TEntity>> }>,
    ): this {
        this.strategies.push({
            fieldName,
            lookup: async (ctx, service, value) => {
                if (value === undefined || value === null) return null;
                const result = await findAllFn(ctx, service, {
                    filter: { [filterField]: { eq: value } },
                });
                if (result.totalItems > 0) {
                    return { id: result.items[0].id, entity: result.items[0] as TEntity };
                }
                return null;
            },
        });
        return this;
    }

    /**
     * Add a lookup strategy for finding by ID
     */
    addIdStrategy(
        findOneFn: (
            ctx: RequestContext,
            service: TService,
            id: ID,
        ) => Promise<TEntity | null | undefined>,
    ): this {
        this.strategies.push({
            fieldName: 'id',
            lookup: async (ctx, service, value) => {
                if (value === undefined || value === null) return null;
                const entity = await findOneFn(ctx, service, value as ID);
                if (entity) {
                    return { id: (entity as unknown as { id: ID }).id, entity };
                }
                return null;
            },
        });
        return this;
    }

    /**
     * Add a custom lookup strategy
     */
    addCustomStrategy(strategy: LookupStrategy<TService, TEntity>): this {
        this.strategies.push(strategy);
        return this;
    }

    /**
     * Find existing entity using configured strategies
     */
    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: TInput,
    ): Promise<{ id: ID; entity: TEntity } | null> {
        for (const strategy of this.strategies) {
            if (!lookupFields.includes(strategy.fieldName)) {
                continue;
            }

            const value = getNestedValue(
                record as Record<string, unknown>,
                strategy.fieldName,
            );
            if (value === undefined || value === null) {
                continue;
            }

            const result = await strategy.lookup(ctx, this.service, value);
            if (result) {
                return result as { id: ID; entity: TEntity };
            }
        }

        return null;
    }
}

/**
 * Factory function to create a lookup helper
 */
export function createLookupHelper<TService, TEntity, TInput>(
    service: TService,
): EntityLookupHelper<TService, TEntity, TInput> {
    return new EntityLookupHelper<TService, TEntity, TInput>(service);
}

export function createCustomFieldLookupStrategy<TService, TEntity extends VendureEntity>(
    connection: TransactionalConnection,
    entityType: Type<TEntity>,
    customFieldName: string,
): LookupStrategy<TService, TEntity> {
    const fieldName = `customFields.${customFieldName}`;
    return {
        fieldName,
        lookup: async (ctx, _service, value) => {
            if (value === undefined || value === null) return null;
            const repository = connection.getRepository(ctx, entityType);
            const column = repository.metadata.findColumnWithPropertyPath(fieldName);
            if (!column) {
                throw new Error(
                    `${entityType.name} custom field "${customFieldName}" is not configured`,
                );
            }
            const alias = 'lookupEntity';
            const query = repository.createQueryBuilder(alias);
            const entity = await query
                .where(
                    `${query.escape(alias)}.${query.escape(column.databaseName)} = :customFieldValue`,
                    { customFieldValue: value },
                )
                .getOne();
            return entity ? { id: entity.id, entity } : null;
        },
    };
}
