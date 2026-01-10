import { ID, RequestContext, CollectionService } from '@vendure/core';
import { CollectionInput, ConfigurableOperationInput } from './types';
import { TRANSFORM_LIMITS } from '../../constants/defaults';

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

export function buildFilterOperation(
    filter: { code: string; args: Record<string, unknown> },
): ConfigurableOperationInput {
    return {
        code: filter.code,
        arguments: Object.entries(filter.args || {}).map(([name, value]) => ({
            name,
            value: JSON.stringify(value),
        })),
    };
}

export function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, TRANSFORM_LIMITS.SLUG_MAX_LENGTH);
}

export function isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('connection') ||
            message.includes('temporarily')
        );
    }
    return false;
}

export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}
