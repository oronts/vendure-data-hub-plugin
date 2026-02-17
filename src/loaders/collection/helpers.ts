import { ID, RequestContext, CollectionService } from '@vendure/core';
import { CollectionInput } from './types';

export { slugify, isRecoverableError, shouldUpdateField, buildConfigurableOperation } from '../shared-helpers';

export function sortByHierarchy(records: CollectionInput[]): CollectionInput[] {
    const roots: CollectionInput[] = [];
    const children: CollectionInput[] = [];

    for (const record of records) {
        if (!record.parentSlug && !record.parentId) {
            roots.push(record);
        } else {
            children.push(record);
        }
    }

    return [...roots, ...children];
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
