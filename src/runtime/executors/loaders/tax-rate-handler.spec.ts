import { describe, expect, it, vi } from 'vitest';
import type { ID, RequestContext } from '@vendure/core';
import type { PipelineStepDefinition } from '../../../types';
import { TaxRateHandler } from './tax-rate-handler';

interface ReferenceEntity {
    id: ID;
    name: string;
    customFields: { code: string };
}

function createReferenceService(entities: ReferenceEntity[]) {
    return {
        findOne: vi.fn(async (_ctx: RequestContext, id: ID) =>
            entities.find(entity => entity.id === id)),
        findAll: vi.fn(async (_ctx: RequestContext, options?: unknown) => {
            const value = options as { skip?: number; take?: number } | undefined;
            const skip = value?.skip ?? 0;
            const take = value?.take ?? entities.length;
            return {
                items: entities.slice(skip, skip + take),
                totalItems: entities.length,
            };
        }),
    };
}

function createFixture() {
    const taxRateService = {
        findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        create: vi.fn().mockResolvedValue({ id: 'tax-rate-1' }),
        update: vi.fn().mockResolvedValue({ id: 'tax-rate-1' }),
    };
    const taxCategoryService = createReferenceService([{
        id: 'tax-category-1',
        name: 'Standard Tax',
        customFields: { code: 'standard-tax' },
    }]);
    const zoneService = createReferenceService([{
        id: 'zone-1',
        name: 'Europe',
        customFields: { code: 'eu-zone' },
    }]);

    return {
        handler: new TaxRateHandler(
            taxRateService as never,
            taxCategoryService as never,
            zoneService as never,
        ),
        taxRateService,
        taxCategoryService,
        zoneService,
    };
}

function createStep(): PipelineStepDefinition {
    return {
        key: 'load-tax-rates',
        type: 'LOAD',
        config: { adapterCode: 'taxRateUpsert' },
    } as PipelineStepDefinition;
}

describe('TaxRateHandler references', () => {
    const ctx = {} as RequestContext;

    it('resolves codes only through customFields.code', async () => {
        const { handler, taxRateService } = createFixture();

        const result = await handler.execute(ctx, createStep(), [{
            name: 'VAT',
            value: 19,
            taxCategoryCode: 'standard-tax',
            zoneCode: 'eu-zone',
        }]);

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(taxRateService.create).toHaveBeenCalledWith(ctx, {
            name: 'VAT',
            value: 19,
            enabled: true,
            categoryId: 'tax-category-1',
            zoneId: 'zone-1',
        });
    });

    it('does not accept display names as reference codes', async () => {
        const { handler, taxRateService } = createFixture();
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        const result = await handler.execute(ctx, createStep(), [{
            name: 'VAT',
            value: 19,
            taxCategoryCode: 'Standard Tax',
            zoneCode: 'Europe',
        }], onRecordError);

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(taxRateService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-tax-rates',
            'Tax category not found for record "VAT"',
            expect.anything(),
        );
    });

    it('verifies and uses explicit Vendure IDs', async () => {
        const {
            handler,
            taxRateService,
            taxCategoryService,
            zoneService,
        } = createFixture();

        const result = await handler.execute(ctx, createStep(), [{
            name: 'VAT',
            value: 19,
            taxCategoryId: 'tax-category-1',
            zoneId: 'zone-1',
        }]);

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(taxCategoryService.findOne).toHaveBeenCalledWith(ctx, 'tax-category-1');
        expect(zoneService.findOne).toHaveBeenCalledWith(ctx, 'zone-1');
        expect(taxRateService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                categoryId: 'tax-category-1',
                zoneId: 'zone-1',
            }),
        );
    });

    it('rejects ambiguous references', async () => {
        const { handler, taxRateService } = createFixture();
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        const result = await handler.execute(ctx, createStep(), [{
            name: 'VAT',
            value: 19,
            taxCategoryId: 'tax-category-1',
            taxCategoryCode: 'standard-tax',
            zoneId: 'zone-1',
        }], onRecordError);

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(taxRateService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-tax-rates',
            'Provide either taxCategoryId or taxCategoryCode, not both',
            expect.anything(),
            expect.anything(),
        );
    });
});
