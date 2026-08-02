import { DeletionResult } from '@vendure/common/lib/generated-types';
import { EntityNotFoundError, RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { PipelineStepDefinition } from '../../../types';
import { parseDeletionHandlerConfig } from './deletion-handler-config';
import { DeletionHandler } from './deletion-handler';

function createFixture() {
    const productService = {
        findOneBySlug: vi.fn(),
        softDelete: vi.fn(),
    };
    const productVariantService = {
        findAll: vi.fn(),
        softDelete: vi.fn(),
    };
    const promotionService = {
        findAll: vi.fn(),
        softDeletePromotion: vi.fn(),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
    };
    const loggerFactory = {
        createLogger: vi.fn().mockReturnValue(logger),
    } as unknown as DataHubLoggerFactory;
    const unusedService = {};

    return {
        logger,
        productService,
        productVariantService,
        promotionService,
        handler: new DeletionHandler(
            productService as never,
            productVariantService as never,
            unusedService as never,
            promotionService as never,
            unusedService as never,
            unusedService as never,
            unusedService as never,
            unusedService as never,
            unusedService as never,
            unusedService as never,
            unusedService as never,
            unusedService as never,
            unusedService as never,
            unusedService as never,
            unusedService as never,
            loggerFactory,
        ),
    };
}

const context = {} as RequestContext;
const productStep = {
    key: 'delete-products',
    type: 'LOAD',
    config: {
        adapterCode: 'entityDeletion',
        entityType: 'product',
        matchBy: 'slug',
    },
} as PipelineStepDefinition;

describe('DeletionHandler', () => {
    it('rejects incompatible entity match modes during config parsing', () => {
        expect(() => parseDeletionHandlerConfig({
            entityType: 'customer',
            matchBy: 'slug',
        })).toThrow('Unsupported matchBy "slug" for customer deletion');
    });

    it('counts missing lookup targets as skipped', async () => {
        const { handler, logger, productService } = createFixture();
        productService.findOneBySlug.mockResolvedValue(undefined);
        const onRecordError = vi.fn();

        await expect(handler.execute(
            context,
            productStep,
            [{ slug: 'missing-product' }],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 0, skipped: 1 });
        expect(logger.warn).toHaveBeenCalledWith(
            'Product not found for deletion: missing-product (matchBy: slug)',
        );
        expect(onRecordError).not.toHaveBeenCalled();
    });

    it('delegates product and variant deletion to Vendure exactly once', async () => {
        const { handler, productService, productVariantService } = createFixture();
        productService.findOneBySlug.mockResolvedValue({ id: 'product-1' });
        productService.softDelete.mockResolvedValue({ result: DeletionResult.DELETED });

        await expect(handler.execute(
            context,
            productStep,
            [{ slug: 'product-one' }],
        )).resolves.toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productService.softDelete).toHaveBeenCalledWith(context, 'product-1');
        expect(productVariantService.findAll).not.toHaveBeenCalled();
        expect(productVariantService.softDelete).not.toHaveBeenCalled();
    });

    it('reports Vendure NOT_DELETED responses as failures', async () => {
        const { handler, productService } = createFixture();
        productService.findOneBySlug.mockResolvedValue({ id: 'product-1' });
        productService.softDelete.mockResolvedValue({
            result: DeletionResult.NOT_DELETED,
            message: 'Product is still referenced',
        });
        const record = { slug: 'product-one' };
        const onRecordError = vi.fn();

        await expect(handler.execute(
            context,
            productStep,
            [record],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(onRecordError).toHaveBeenCalledWith(
            'delete-products',
            'Failed to delete product "product-one": Product is still referenced',
            record,
            expect.any(String),
        );
    });

    it('counts Vendure entity-not-found errors as skipped for ID matching', async () => {
        const { handler, productService } = createFixture();
        productService.softDelete.mockRejectedValue(new EntityNotFoundError('Product', 'missing-id'));
        const idStep = {
            ...productStep,
            config: { ...productStep.config, matchBy: 'id', identifierField: 'id' },
        } as PipelineStepDefinition;

        await expect(handler.execute(
            context,
            idStep,
            [{ id: 'missing-id' }],
        )).resolves.toEqual({ ok: 0, fail: 0, skipped: 1 });
    });

    it('rejects ambiguous lookup targets before deleting', async () => {
        const { handler, promotionService } = createFixture();
        promotionService.findAll.mockResolvedValue({
            items: [{ id: 'promotion-1' }, { id: 'promotion-2' }],
            totalItems: 2,
        });
        const promotionStep = {
            key: 'delete-promotions',
            type: 'LOAD',
            config: {
                adapterCode: 'entityDeletion',
                entityType: 'promotion',
            },
        } as PipelineStepDefinition;
        const record = { code: 'SUMMER' };
        const onRecordError = vi.fn();

        await expect(handler.execute(
            context,
            promotionStep,
            [record],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(promotionService.softDeletePromotion).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'delete-promotions',
            'Multiple promotion records match "SUMMER"',
            record,
            expect.any(String),
        );
    });
});
