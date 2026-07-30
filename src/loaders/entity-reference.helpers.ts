import type { ID, RequestContext } from '@vendure/core';
import { PAGINATION } from '../constants/defaults';

const REFERENCE_LOOKUP_PAGE_SIZE = 250;

interface ReferenceEntity {
    readonly id: ID;
    readonly customFields?: unknown;
}

interface PaginatedReferenceService<T extends ReferenceEntity> {
    findAll(
        ctx: RequestContext,
        options?: unknown,
    ): Promise<{ readonly items: T[]; readonly totalItems: number }>;
    findOne(ctx: RequestContext, id: ID): Promise<T | undefined>;
}

export async function resolveEntityReferenceId<T extends ReferenceEntity>(
    ctx: RequestContext,
    service: PaginatedReferenceService<T>,
    entityLabel: string,
    reference: { readonly id?: ID; readonly code?: string },
): Promise<ID | null> {
    if (reference.id !== undefined && reference.code !== undefined) {
        throw new Error(`${entityLabel} reference must provide either ID or code, not both`);
    }
    if (reference.id !== undefined) {
        const entity = await service.findOne(ctx, reference.id);
        if (!entity) {
            throw new Error(`${entityLabel} ID "${String(reference.id)}" was not found`);
        }
        return entity.id;
    }
    if (reference.code === undefined) return null;
    if (reference.code.trim().length === 0) {
        throw new Error(`${entityLabel} code must not be empty`);
    }

    return findEntityId(
        ctx,
        service,
        entityLabel,
        entity => readCustomFieldCode(entity.customFields) === reference.code,
    );
}

export async function resolveDefaultEntityId<T extends ReferenceEntity & { readonly isDefault: boolean }>(
    ctx: RequestContext,
    service: PaginatedReferenceService<T>,
    entityLabel: string,
): Promise<ID> {
    const id = await findEntityId(
        ctx,
        service,
        entityLabel,
        entity => entity.isDefault,
    );
    if (id === null) {
        throw new Error(`${entityLabel} has no default entity`);
    }
    return id;
}

async function findEntityId<T extends ReferenceEntity>(
    ctx: RequestContext,
    service: PaginatedReferenceService<T>,
    entityLabel: string,
    predicate: (entity: T) => boolean,
): Promise<ID | null> {
    let skip = 0;
    while (skip < PAGINATION.MAX_LOOKUP_LIMIT) {
        const take = Math.min(
            REFERENCE_LOOKUP_PAGE_SIZE,
            PAGINATION.MAX_LOOKUP_LIMIT - skip,
        );
        const page = await service.findAll(ctx, {
            skip,
            take,
            sort: { id: 'ASC' },
        });
        const match = page.items.find(predicate);
        if (match) return match.id;
        if (skip + page.items.length >= page.totalItems) return null;
        if (page.items.length === 0) {
            throw new Error(`${entityLabel} lookup pagination did not advance`);
        }
        skip += page.items.length;
    }

    throw new Error(
        `${entityLabel} lookup exceeds ${PAGINATION.MAX_LOOKUP_LIMIT} records; use an explicit ID`,
    );
}

function readCustomFieldCode(customFields: unknown): string | undefined {
    if (customFields === null || typeof customFields !== 'object') return undefined;
    const code = Reflect.get(customFields, 'code');
    return typeof code === 'string' ? code : undefined;
}
