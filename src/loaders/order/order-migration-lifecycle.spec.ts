import { describe, expect, it, vi } from 'vitest';
import type { DataHubLogger } from '../../services/logger/datahub-logger';
import { OrderMigrationLifecycle } from './order-migration-lifecycle';

function createFixture() {
    const logger = {
        warn: vi.fn(),
    } as unknown as DataHubLogger;
    const orderService = {
        findOne: vi.fn(async () => ({ id: 1, state: 'AddingItems' })),
        getEligibleShippingMethods: vi.fn(async () => [{ id: 1, code: 'standard' }]),
        setShippingMethod: vi.fn(async () => ({ id: 1 })),
        transitionToState: vi.fn(async () => ({ id: 1 })),
        getEligiblePaymentMethods: vi.fn(async () => [{ code: 'payment' }]),
        addPaymentToOrder: vi.fn(async () => ({ id: 1 })),
        createFulfillment: vi.fn(async () => ({ id: 2 })),
        transitionFulfillmentToState: vi.fn(async () => ({ id: 2 })),
    };
    const shippingMethodService = {
        findAll: vi.fn(async () => ({ totalItems: 1, items: [{ id: '1' }] })),
    };
    const connection = {
        getRepository: vi.fn(() => ({
            find: vi.fn(async () => [{ id: 11, quantity: 2 }]),
        })),
    };
    const lifecycle = new OrderMigrationLifecycle({
        orderService: orderService as never,
        shippingMethodService: shippingMethodService as never,
        connection: connection as never,
        logger,
    });
    return { lifecycle, orderService, shippingMethodService, logger };
}

describe('order migration lifecycle', () => {
    it('matches equivalent string and numeric shipping method IDs', async () => {
        const { lifecycle, orderService } = createFixture();
        await lifecycle.ensureShippingMethod({} as never, 7, 'standard');
        expect(orderService.setShippingMethod).toHaveBeenCalledWith(
            expect.anything(),
            7,
            ['1'],
        );
    });

    it('propagates Vendure shipping-method error results', async () => {
        const { lifecycle, orderService } = createFixture();
        orderService.setShippingMethod.mockResolvedValue({
            errorCode: 'INELIGIBLE_SHIPPING_METHOD_ERROR',
            message: 'Shipping method is not eligible',
        } as never);

        await expect(
            lifecycle.ensureShippingMethod({} as never, 7, 'standard'),
        ).rejects.toThrow('Shipping method is not eligible');
    });

    it('rejects an explicitly requested missing shipping method', async () => {
        const { lifecycle, shippingMethodService } = createFixture();
        shippingMethodService.findAll.mockResolvedValue({ totalItems: 0, items: [] });

        await expect(
            lifecycle.ensureShippingMethod({} as never, 7, 'missing'),
        ).rejects.toThrow('Shipping method "missing" was not found');
    });

    it('rejects an explicitly requested ineligible shipping method', async () => {
        const { lifecycle, orderService } = createFixture();
        orderService.getEligibleShippingMethods.mockResolvedValue([
            { id: 2, code: 'other' },
        ]);

        await expect(
            lifecycle.ensureShippingMethod({} as never, 7, 'standard'),
        ).rejects.toThrow('Shipping method "standard" is not eligible for order 7');
        expect(orderService.setShippingMethod).not.toHaveBeenCalled();
    });

    it('reports state transition errors without continuing migration', async () => {
        const { lifecycle, orderService, logger } = createFixture();
        orderService.transitionToState.mockResolvedValue({
            errorCode: 'ORDER_STATE_TRANSITION_ERROR',
            message: 'Transition rejected',
        } as never);

        await expect(lifecycle.transitionToTarget(
            {} as never,
            7,
            'PaymentSettled',
            { paymentMetadata: { migrationImport: true } },
        )).resolves.toBe(false);
        expect(orderService.addPaymentToOrder).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            'Cannot transition order 7 to "ArrangingPayment": Transition rejected',
        );
    });

    it('uses Vendure payment mutation to reach PaymentSettled', async () => {
        const { lifecycle, orderService } = createFixture();
        orderService.findOne
            .mockResolvedValueOnce({ id: 1, state: 'AddingItems' })
            .mockResolvedValueOnce({ id: 1, state: 'ArrangingPayment' })
            .mockResolvedValueOnce({ id: 1, state: 'PaymentSettled' });

        await expect(lifecycle.transitionToTarget(
            {} as never,
            7,
            'PaymentSettled',
            {
                paymentMethodCode: 'migration-payment',
                paymentMetadata: { source: 'legacy-erp' },
            },
        )).resolves.toBe(true);
        expect(orderService.transitionToState).toHaveBeenCalledTimes(1);
        expect(orderService.addPaymentToOrder).toHaveBeenCalledWith(
            expect.anything(),
            7,
            {
                method: 'migration-payment',
                metadata: { source: 'legacy-erp' },
            },
        );
    });

    it('rejects partial fulfillment targets before mutating the order', async () => {
        const { lifecycle, orderService, logger } = createFixture();

        await expect(lifecycle.transitionToTarget(
            {} as never,
            7,
            'PartiallyShipped',
            { paymentMetadata: { migrationImport: true } },
        )).resolves.toBe(false);
        expect(orderService.transitionToState).not.toHaveBeenCalled();
        expect(orderService.addPaymentToOrder).not.toHaveBeenCalled();
        expect(orderService.createFulfillment).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            'Cannot migrate order 7 to PartiallyShipped without per-line fulfillment quantities',
        );
    });

    it('performs and verifies low-rank state transitions', async () => {
        const { lifecycle, orderService } = createFixture();
        orderService.findOne
            .mockResolvedValueOnce({ id: 1, state: 'Created' })
            .mockResolvedValueOnce({ id: 1, state: 'AddingItems' });

        await expect(lifecycle.transitionToTarget(
            {} as never,
            7,
            'AddingItems',
            { paymentMetadata: { migrationImport: true } },
        )).resolves.toBe(true);
        expect(orderService.transitionToState).toHaveBeenCalledWith(
            expect.anything(),
            7,
            'AddingItems',
        );
    });
});
