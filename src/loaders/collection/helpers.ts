import { ID, RequestContext, CollectionService } from '@vendure/core';
import { CollectionInput } from './types';

export { slugify, isRecoverableError, shouldUpdateField, buildConfigurableOperation } from '../shared-helpers';

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
