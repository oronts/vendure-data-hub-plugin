import { ID, RequestContext, CollectionService } from '@vendure/core';
import { ConfigurableOperationInput } from '@vendure/common/lib/generated-types';
import { CollectionInput, CollectionFilterInput } from './types';
import { FiltersMode } from '../../../shared/types';
import { DataHubLogger } from '../../services/logger';

export { slugify, isRecoverableError, shouldUpdateField, buildConfigurableOperation } from '../shared-helpers';
import { buildConfigurableOperation } from '../shared-helpers';

export function sortByHierarchy(records: CollectionInput[]): CollectionInput[] {
    // Build a lookup of slug -> record for parent resolution
    const bySlug = new Map<string, CollectionInput>();
    for (const record of records) {
        if (record.slug) {
            bySlug.set(record.slug, record);
        }
    }

    // Build adjacency: parent identifier -> children
    const childrenOf = new Map<string, CollectionInput[]>();
    const roots: CollectionInput[] = [];

    for (const record of records) {
        const parentKey = record.parentSlug ?? record.parentId;
        if (!parentKey) {
            roots.push(record);
        } else {
            const list = childrenOf.get(parentKey) ?? [];
            list.push(record);
            childrenOf.set(parentKey, list);
        }
    }

    // Topological traversal: BFS from roots, enqueue children as parents are visited
    const sorted: CollectionInput[] = [];
    const visited = new Set<CollectionInput>();
    const queue = [...roots];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        sorted.push(current);

        // Find children by slug
        if (current.slug) {
            const kids = childrenOf.get(current.slug);
            if (kids) {
                for (const child of kids) {
                    if (!visited.has(child)) queue.push(child);
                }
            }
        }
        // Find children by id (if records reference parentId)
        if (current.id) {
            const kids = childrenOf.get(String(current.id));
            if (kids) {
                for (const child of kids) {
                    if (!visited.has(child)) queue.push(child);
                }
            }
        }
    }

    // Append any remaining records whose parents are not in the batch
    for (const record of records) {
        if (!visited.has(record)) {
            sorted.push(record);
        }
    }

    return sorted;
}

export async function findParentCollection(
    ctx: RequestContext,
    collectionService: CollectionService,
    record: CollectionInput,
): Promise<{ id: ID } | null> {
    if (record.parentId) {
        const collection = await collectionService.findOne(ctx, record.parentId as ID);
        return collection ? { id: collection.id } : null;
    }
    if (record.parentSlug) {
        const parents = await collectionService.findAll(ctx, {
            filter: { slug: { eq: record.parentSlug } },
        });
        return parents.totalItems > 0 ? { id: parents.items[0].id } : null;
    }
    return null;
}

export async function resolveParentId(
    ctx: RequestContext,
    collectionService: CollectionService,
    record: CollectionInput,
): Promise<ID | undefined> {
    const parent = await findParentCollection(ctx, collectionService, record);
    return parent?.id;
}

/**
 * Handle collection filters based on the specified mode.
 *
 * @param ctx Request context
 * @param collectionService Collection service instance
 * @param collectionId ID of the collection to update
 * @param filters New filters from the import record
 * @param mode How to handle the filters (REPLACE_ALL, MERGE, SKIP)
 * @param logger Logger instance
 * @returns ConfigurableOperationInput array to apply
 */
export async function handleCollectionFilters(
    ctx: RequestContext,
    collectionService: CollectionService,
    collectionId: ID,
    filters: CollectionFilterInput[],
    mode: FiltersMode = 'REPLACE_ALL',
    logger: DataHubLogger,
): Promise<ConfigurableOperationInput[]> {
    if (mode === 'SKIP') {
        // Empty array, caller treats as no-op for filters
        return [];
    }

    const newFilters = filters.map(f => buildConfigurableOperation(f));

    if (mode === 'REPLACE_ALL') {
        // Replace all filters (current behavior)
        return newFilters;
    }

    if (mode === 'MERGE') {
        // Merge: keep existing filters, add new ones
        const collection = await collectionService.findOne(ctx, collectionId);
        if (!collection?.filters) {
            return newFilters;
        }

        const existingFilters = collection.filters.map(f => ({ code: f.code, arguments: f.args }));
        const merged = [...existingFilters, ...newFilters];
        logger.debug(`Merged ${existingFilters.length} existing + ${newFilters.length} new filters = ${merged.length} total`);
        return merged;
    }

    return newFilters;
}
