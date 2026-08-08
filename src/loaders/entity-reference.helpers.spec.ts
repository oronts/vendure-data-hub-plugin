import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { resolveEntityReferenceId } from './entity-reference.helpers';

interface TestEntity {
    id: number;
    customFields: { code: string };
}

function createService(entities: TestEntity[], totalItems = entities.length) {
    return {
        findOne: vi.fn(async (_ctx: RequestContext, id: string | number) =>
            entities.find(entity => entity.id === id)),
        findAll: vi.fn(async (_ctx: RequestContext, options?: unknown) => {
            const value = options as { skip?: number; take?: number } | undefined;
            const skip = value?.skip ?? 0;
            const take = value?.take ?? entities.length;
            return { items: entities.slice(skip, skip + take), totalItems };
        }),
    };
}

describe('entity reference resolution', () => {
    const ctx = {} as RequestContext;

    it('paginates deterministically until an exact custom-field code is found', async () => {
        const entities = Array.from({ length: 300 }, (_, id) => ({
            id,
            customFields: { code: `code-${id}` },
        }));
        const service = createService(entities);

        await expect(resolveEntityReferenceId(
            ctx,
            service,
            'Entity',
            { code: 'code-275' },
        )).resolves.toBe(275);
        expect(service.findAll).toHaveBeenCalledTimes(2);
        expect(service.findAll).toHaveBeenLastCalledWith(ctx, {
            skip: 250,
            take: 250,
            sort: { id: 'ASC' },
        });
    });

    it('does not treat the display name as a code', async () => {
        const service = createService([{
            id: 1,
            customFields: { code: 'stable-code' },
            name: 'Display name',
        } as TestEntity]);

        await expect(resolveEntityReferenceId(
            ctx,
            service,
            'Entity',
            { code: 'Display name' },
        )).resolves.toBeNull();
    });

    it('verifies explicit IDs through the service', async () => {
        const service = createService([]);

        await expect(resolveEntityReferenceId(ctx, service, 'Entity', { id: 99 }))
            .rejects.toThrow('ID "99" was not found');
        expect(service.findAll).not.toHaveBeenCalled();
    });

    it('fails explicitly when a code lookup exceeds the safety cap', async () => {
        const service = {
            findOne: vi.fn(),
            findAll: vi.fn(async (_ctx: RequestContext, options?: unknown) => {
                const value = options as { skip: number; take: number };
                return {
                    items: Array.from({ length: value.take }, (_, offset) => ({
                        id: value.skip + offset,
                        customFields: { code: `other-${value.skip + offset}` },
                    })),
                    totalItems: 10_000,
                };
            }),
        };

        await expect(resolveEntityReferenceId(ctx, service, 'Entity', {
            code: 'missing',
        })).rejects.toThrow('lookup exceeds 9999 records; use an explicit ID');
        expect(service.findAll).toHaveBeenCalledTimes(40);
    });

    it('rejects ambiguous and empty references before querying', async () => {
        const service = createService([]);
        await expect(resolveEntityReferenceId(ctx, service, 'Entity', { id: 1, code: 'one' }))
            .rejects.toThrow('either ID or code, not both');
        await expect(resolveEntityReferenceId(ctx, service, 'Entity', { code: '   ' }))
            .rejects.toThrow('code must not be empty');
        expect(service.findAll).not.toHaveBeenCalled();
    });
});
