import type { FulfillOrderInput } from '@vendure/common/lib/generated-types';
import type { ID } from '@vendure/common/lib/shared-types';
import {
    OrderLine,
    OrderService,
    RequestContext,
    ShippingMethodService,
    TransactionalConnection,
} from '@vendure/core';
import type { FulfillmentState } from '@vendure/core';
import type { DataHubLogger } from '../../services/logger/datahub-logger';
import { getErrorMessage } from '../../utils/error.utils';
import { findShippingMethodByCode } from './helpers';
import { STATE_RANK } from './types';

interface OrderMigrationLifecycleDependencies {
    orderService: OrderService;
    connection: TransactionalConnection;
    shippingMethodService: ShippingMethodService;
    logger: DataHubLogger;
}

interface TransitionOptions {
    paymentMethodCode?: string;
    paymentMetadata: Record<string, unknown>;
}

const PARTIAL_FULFILLMENT_STATES = new Set([
    'PartiallyShipped',
    'PartiallyDelivered',
]);

export function isPartialFulfillmentState(state: string): boolean {
    return PARTIAL_FULFILLMENT_STATES.has(state);
}

export function getVendureMutationError(result: unknown): string | undefined {
    if (!result || typeof result !== 'object' || !('errorCode' in result)) {
        return undefined;
    }
    const error = result as { errorCode?: unknown; message?: unknown };
    return typeof error.message === 'string'
        ? error.message
        : String(error.errorCode ?? 'unknown error');
}

export class OrderMigrationLifecycle {
    private readonly orderService: OrderService;
    private readonly connection: TransactionalConnection;
    private readonly shippingMethodService: ShippingMethodService;
    private readonly logger: DataHubLogger;

    constructor(dependencies: OrderMigrationLifecycleDependencies) {
        this.orderService = dependencies.orderService;
        this.connection = dependencies.connection;
        this.shippingMethodService = dependencies.shippingMethodService;
        this.logger = dependencies.logger;
    }

    async ensureShippingMethod(
        ctx: RequestContext,
        orderId: ID,
        shippingMethodCode?: string,
    ): Promise<void> {
        if (shippingMethodCode) {
            const shippingMethod = await findShippingMethodByCode(
                ctx,
                this.shippingMethodService,
                shippingMethodCode,
            );
            if (shippingMethod) {
                const eligibleMethods = await this.orderService.getEligibleShippingMethods(ctx, orderId);
                const eligible = eligibleMethods.some(method => String(method.id) === String(shippingMethod.id));
                if (eligible) {
                    await this.setShippingMethod(ctx, orderId, shippingMethod.id);
                    return;
                }
                throw new Error(
                    `Shipping method "${shippingMethodCode}" is not eligible for order ${orderId}`,
                );
            }
            throw new Error(`Shipping method "${shippingMethodCode}" was not found`);
        }

        const eligibleMethods = await this.orderService.getEligibleShippingMethods(ctx, orderId);
        if (eligibleMethods[0]) {
            await this.setShippingMethod(ctx, orderId, eligibleMethods[0].id);
        } else {
            this.logger.warn(`No eligible shipping methods found for order ${orderId}`);
        }
    }

    async transitionToTarget(
        ctx: RequestContext,
        orderId: ID,
        targetState: string,
        options: TransitionOptions,
    ): Promise<boolean> {
        const targetRank = STATE_RANK[targetState];
        if (targetRank === undefined) {
            return this.tryTransition(ctx, orderId, targetState);
        }

        let order = await this.orderService.findOne(ctx, orderId);
        if (!order) {
            return false;
        }
        if (isPartialFulfillmentState(targetState) && order.state !== targetState) {
            this.logger.warn(
                `Cannot migrate order ${orderId} to ${targetState} without per-line fulfillment quantities`,
            );
            return false;
        }
        if (order.state === targetState) {
            return true;
        }
        if (targetRank < 2) {
            if (!await this.tryTransition(ctx, orderId, targetState)) {
                return false;
            }
            order = await this.orderService.findOne(ctx, orderId);
            return order?.state === targetState;
        }

        const rank = () => STATE_RANK[order?.state ?? ''] ?? -1;
        const refresh = async () => {
            order = await this.orderService.findOne(ctx, orderId);
        };

        if (targetRank >= 2 && rank() < 2) {
            if (!await this.tryTransition(ctx, orderId, 'ArrangingPayment')) {
                return false;
            }
            await refresh();
        }
        if (targetRank >= 3 && rank() < 3) {
            if (!await this.addPayment(ctx, orderId, options)) {
                return false;
            }
            await refresh();
        }
        if (targetRank >= 4 && rank() < 4) {
            if (!await this.tryTransition(ctx, orderId, 'PaymentSettled')) {
                return false;
            }
            await refresh();
        }
        if (targetRank >= 5 && rank() < 5) {
            const fulfillmentState = targetRank >= 8 ? 'Delivered' : 'Shipped';
            if (!await this.addFulfillment(ctx, orderId, fulfillmentState)) {
                return false;
            }
            await refresh();
        }
        return order?.state === targetState;
    }

    private async setShippingMethod(ctx: RequestContext, orderId: ID, methodId: ID): Promise<void> {
        const error = getVendureMutationError(
            await this.orderService.setShippingMethod(ctx, orderId, [methodId]),
        );
        if (error) {
            throw new Error(`Failed to set shipping method on order ${orderId}: ${error}`);
        }
    }

    private async tryTransition(
        ctx: RequestContext,
        orderId: ID,
        state: string,
    ): Promise<boolean> {
        try {
            const result = await this.orderService.transitionToState(
                ctx,
                orderId,
                state as Parameters<OrderService['transitionToState']>[2],
            );
            const error = getVendureMutationError(result);
            if (error) {
                this.logger.warn(`Cannot transition order ${orderId} to "${state}": ${error}`);
                return false;
            }
            return true;
        } catch (error) {
            this.logger.warn(
                `Failed to transition order ${orderId} to "${state}": ${getErrorMessage(error)}`,
            );
            return false;
        }
    }

    private async addPayment(
        ctx: RequestContext,
        orderId: ID,
        options: TransitionOptions,
    ): Promise<boolean> {
        let methodCode = options.paymentMethodCode;
        if (!methodCode) {
            methodCode = (await this.orderService.getEligiblePaymentMethods(ctx, orderId))[0]?.code;
        }
        if (!methodCode) {
            this.logger.warn(`No payment method available for order ${orderId} migration`);
            return false;
        }

        const result = await this.orderService.addPaymentToOrder(ctx, orderId, {
            method: methodCode,
            metadata: options.paymentMetadata,
        });
        const error = getVendureMutationError(result);
        if (error) {
            this.logger.warn(`Failed to add payment to order ${orderId}: ${error}`);
            return false;
        }
        return true;
    }

    private async addFulfillment(
        ctx: RequestContext,
        orderId: ID,
        targetState: 'Shipped' | 'Delivered',
    ): Promise<boolean> {
        const orderLines = await this.connection.getRepository(ctx, OrderLine).find({
            where: { order: { id: orderId } },
        });
        if (orderLines.length === 0) {
            this.logger.warn(`No order lines found for order ${orderId} - cannot create fulfillment`);
            return false;
        }

        const input: FulfillOrderInput = {
            lines: orderLines.map(line => ({
                orderLineId: line.id,
                quantity: line.quantity,
            })),
            handler: {
                code: 'manual-fulfillment',
                arguments: [
                    { name: 'method', value: 'Migration' },
                    { name: 'trackingCode', value: '' },
                ],
            },
        };
        const fulfillment = await this.orderService.createFulfillment(ctx, input);
        const createError = getVendureMutationError(fulfillment);
        if (createError) {
            this.logger.warn(`Failed to create fulfillment for order ${orderId}: ${createError}`);
            return false;
        }

        const fulfillmentId = (fulfillment as { id: ID }).id;
        if (!await this.transitionFulfillment(ctx, orderId, fulfillmentId, 'Shipped')) {
            return false;
        }
        return targetState !== 'Delivered' ||
            this.transitionFulfillment(ctx, orderId, fulfillmentId, 'Delivered');
    }

    private async transitionFulfillment(
        ctx: RequestContext,
        orderId: ID,
        fulfillmentId: ID,
        state: FulfillmentState,
    ): Promise<boolean> {
        const result = await this.orderService.transitionFulfillmentToState(
            ctx,
            fulfillmentId,
            state,
        );
        const error = getVendureMutationError(result);
        if (error) {
            this.logger.warn(`Failed to set fulfillment for order ${orderId} to ${state}: ${error}`);
            return false;
        }
        return true;
    }
}
