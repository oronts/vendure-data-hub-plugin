/**
 * Order-related loader handlers (orderNote, applyCoupon, orderTransition)
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    OrderService,
    TransactionalConnection,
    ShippingMethodService,
    Order,
    OrderLine,
} from '@vendure/core';
import type { ID } from '@vendure/common/lib/shared-types';
import type { AddNoteToOrderInput, FulfillOrderInput } from '@vendure/common/lib/generated-types';
import type { OrderState, FulfillmentState } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getStringValue, getIdValue } from '../../../loaders/shared-helpers';
import { findShippingMethodByCode } from '../../../loaders/order/helpers';
import { STATE_RANK } from '../../../loaders/order/types';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { LOGGER_CONTEXTS } from '../../../constants/index';

// ============================================================================
// Config Interfaces
// ============================================================================

interface OrderNoteHandlerConfig {
    orderIdField?: string;
    orderCodeField?: string;
    noteField?: string;
    isPrivate?: boolean;
}

interface ApplyCouponHandlerConfig {
    orderIdField?: string;
    orderCodeField?: string;
    couponField?: string;
}

interface OrderTransitionHandlerConfig {
    orderIdField?: string;
    orderCodeField?: string;
    /** Static target state (used when all records transition to the same state) */
    state?: string;
    /** Record field containing the per-record target state (overrides static `state`) */
    stateField?: string;
    shippingMethodCode?: string;
    paymentMethodCode?: string;
}

// ============================================================================
// Config Extractors
// ============================================================================

/**
 * Extract OrderNoteHandlerConfig from step config
 */
function getOrderNoteConfig(config: JsonObject): OrderNoteHandlerConfig {
    return {
        orderIdField: typeof config.orderIdField === 'string' ? config.orderIdField : undefined,
        orderCodeField: typeof config.orderCodeField === 'string' ? config.orderCodeField : undefined,
        noteField: typeof config.noteField === 'string' ? config.noteField : undefined,
        isPrivate: typeof config.isPrivate === 'boolean' ? config.isPrivate : undefined,
    };
}

/**
 * Extract ApplyCouponHandlerConfig from step config
 */
function getApplyCouponConfig(config: JsonObject): ApplyCouponHandlerConfig {
    return {
        orderIdField: typeof config.orderIdField === 'string' ? config.orderIdField : undefined,
        orderCodeField: typeof config.orderCodeField === 'string' ? config.orderCodeField : undefined,
        couponField: typeof config.couponField === 'string' ? config.couponField : undefined,
    };
}

/**
 * Extract OrderTransitionHandlerConfig from step config
 */
function getOrderTransitionConfig(config: JsonObject): OrderTransitionHandlerConfig {
    return {
        orderIdField: typeof config.orderIdField === 'string' ? config.orderIdField : undefined,
        orderCodeField: typeof config.orderCodeField === 'string' ? config.orderCodeField : undefined,
        state: typeof config.state === 'string' ? config.state : undefined,
        stateField: typeof config.stateField === 'string' ? config.stateField : undefined,
        shippingMethodCode: typeof config.shippingMethodCode === 'string' ? config.shippingMethodCode : undefined,
        paymentMethodCode: typeof config.paymentMethodCode === 'string' ? config.paymentMethodCode : undefined,
    };
}

@Injectable()
export class OrderNoteHandler implements LoaderHandler {
    constructor(
        private orderService: OrderService,
        private connection: TransactionalConnection,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const handlerConfig = getOrderNoteConfig(step.config);
        const orderIdField = handlerConfig.orderIdField ?? 'orderId';
        const orderCodeField = handlerConfig.orderCodeField ?? 'orderCode';
        const noteField = handlerConfig.noteField ?? 'note';
        const isPrivate = handlerConfig.isPrivate ?? false;

        for (const rec of input) {
            try {
                const orderId = getIdValue(rec, orderIdField);
                const orderCode = getStringValue(rec, orderCodeField);
                const noteValue = getStringValue(rec, noteField);
                const note = noteValue || undefined;

                if (!note) { fail++; continue; }

                let targetOrderId: ID | undefined = orderId;
                if (!targetOrderId && orderCode) {
                    const found = await this.connection.getRepository(ctx, Order).findOne({ where: { code: orderCode } });
                    targetOrderId = found?.id;
                }

                if (!targetOrderId) { fail++; continue; }

                const addNoteInput: AddNoteToOrderInput = {
                    id: targetOrderId,
                    note,
                    isPublic: !isPrivate,
                };
                await this.orderService.addNoteToOrder(ctx, addNoteInput);
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'orderNote failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail };
    }
}

@Injectable()
export class ApplyCouponHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private orderService: OrderService,
        private connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ORDER_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const handlerConfig = getApplyCouponConfig(step.config);
        const orderIdField = handlerConfig.orderIdField ?? 'orderId';
        const orderCodeField = handlerConfig.orderCodeField ?? 'orderCode';
        const couponField = handlerConfig.couponField ?? 'coupon';

        for (const rec of input) {
            try {
                let orderId = getIdValue(rec, orderIdField);
                const code = getStringValue(rec, orderCodeField);
                const couponValue = getStringValue(rec, couponField);
                const coupon = couponValue || undefined;

                if (!coupon) { fail++; continue; }
                if (!orderId && code) {
                    const found = await this.connection.getRepository(ctx, Order).findOne({ where: { code } });
                    orderId = found?.id;
                }
                if (!orderId) { fail++; continue; }

                await this.orderService.applyCouponCode(ctx, orderId, coupon);
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'applyCoupon failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, unknown>> {
        let ordersFound = 0;
        const handlerConfig = getApplyCouponConfig(step.config);
        const orderIdField = handlerConfig.orderIdField ?? 'orderId';
        const orderCodeField = handlerConfig.orderCodeField ?? 'orderCode';

        for (const rec of input) {
            const orderId = getIdValue(rec, orderIdField);
            const orderCode = getStringValue(rec, orderCodeField);
            if (orderId) { ordersFound++; continue; }
            if (orderCode) {
                try {
                    const found = await this.connection.getRepository(ctx, Order).findOne({ where: { code: orderCode } });
                    if (found) ordersFound++;
                } catch (error) {
                    this.logger.warn(`Failed to lookup order by code '${orderCode}': ${getErrorMessage(error)}`);
                }
            }
        }
        return { ordersFound };
    }
}

@Injectable()
export class OrderTransitionHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private orderService: OrderService,
        private connection: TransactionalConnection,
        private shippingMethodService: ShippingMethodService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ORDER_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const handlerConfig = getOrderTransitionConfig(step.config);
        const orderIdField = handlerConfig.orderIdField ?? 'orderId';
        const orderCodeField = handlerConfig.orderCodeField ?? 'orderCode';
        const staticState = handlerConfig.state ?? '';
        const stateField = handlerConfig.stateField;

        for (const rec of input) {
            // Per-record state (from stateField) overrides static state config
            const state = (stateField ? getStringValue(rec, stateField) : undefined) || staticState;
            let orderId = getIdValue(rec, orderIdField);
            const code = getStringValue(rec, orderCodeField);

            try {
                if (!orderId && code) {
                    const found = await this.connection.getRepository(ctx, Order).findOne({ where: { code } });
                    orderId = found?.id;
                }
                if (!orderId || !state) { fail++; continue; }

                const success = await this.walkOrderStateMachine(
                    ctx, orderId, state,
                    handlerConfig.shippingMethodCode,
                    handlerConfig.paymentMethodCode,
                );

                if (success) {
                    ok++;
                } else {
                    if (onRecordError) {
                        await onRecordError(step.key, `Failed to transition order ${String(orderId)} to "${state}"`, rec);
                    }
                    fail++;
                }
            } catch (error) {
                const msg = `Failed to transition order ${String(orderId)} to state '${state}': ${getErrorMessage(error)}`;
                if (onRecordError) {
                    await onRecordError(step.key, msg, rec, getErrorStack(error));
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    /**
     * Walk the order state machine from current state to target state,
     * handling all intermediate transitions including shipping method setup
     * and payment addition. Mirrors the logic in OrderLoader.walkOrderStateMachine.
     *
     * Vendure 3.x state machine (no ArrangingShipping):
     *   Created/Draft(0) → AddingItems(1) → ArrangingPayment(2)
     *   → PaymentAuthorized(3) → PaymentSettled(4) → PartiallyShipped(5)
     *   → Shipped(6) → PartiallyDelivered(7) → Delivered(8)
     */
    private async walkOrderStateMachine(
        ctx: RequestContext,
        orderId: ID,
        targetState: string,
        shippingMethodCode?: string,
        paymentMethodCode?: string,
    ): Promise<boolean> {
        const targetRank = STATE_RANK[targetState];
        if (targetRank === undefined) {
            return this.tryTransition(ctx, orderId, targetState);
        }

        let order = await this.orderService.findOne(ctx, orderId);
        if (!order) return false;

        const rank = () => STATE_RANK[order!.state] ?? -1;
        const refresh = async () => { order = await this.orderService.findOne(ctx, orderId); };

        // Step 1: → ArrangingPayment (ensure shipping method is set first)
        if (targetRank >= 2 && rank() < 2) {
            await this.ensureShippingMethod(ctx, orderId, shippingMethodCode);
            if (!await this.tryTransition(ctx, orderId, 'ArrangingPayment')) return false;
            await refresh();
        }

        // Step 2: PaymentAuthorized/PaymentSettled requires addPaymentToOrder
        if (targetRank >= 3 && rank() < 3) {
            await this.addPaymentForMigration(ctx, orderId, paymentMethodCode);
            await refresh();
        }

        // Step 2b: → PaymentSettled (if payment was authorized but not settled)
        if (targetRank >= 4 && rank() === 3) {
            if (!await this.tryTransition(ctx, orderId, 'PaymentSettled')) return false;
            await refresh();
        }

        // Step 3: Create fulfillment and transition to shipping/delivery states.
        // Vendure requires fulfillments before Shipped/Delivered transitions.
        // The fulfillment auto-transitions the order to Shipped (or Delivered).
        if (targetRank >= 5 && rank() < 5) {
            const fulfillTarget = targetRank >= 8 ? 'Delivered' as const : 'Shipped' as const;
            await this.addFulfillmentForMigration(ctx, orderId, fulfillTarget);
            await refresh();
        }

        return true;
    }

    private async tryTransition(ctx: RequestContext, orderId: ID, state: string): Promise<boolean> {
        try {
            const result = await this.orderService.transitionToState(
                ctx, orderId, state as OrderState,
            );
            if (result && typeof result === 'object' && 'errorCode' in result) {
                const errorResult = result as { message?: string; errorCode?: string };
                this.logger.warn(
                    `Cannot transition order ${String(orderId)} to "${state}": ${errorResult.message ?? errorResult.errorCode}`,
                );
                return false;
            }
            return true;
        } catch (err) {
            this.logger.warn(`Failed to transition order ${String(orderId)} to "${state}": ${getErrorMessage(err)}`);
            return false;
        }
    }

    /**
     * Ensure a shipping method is set on the order before state transitions.
     */
    private async ensureShippingMethod(ctx: RequestContext, orderId: ID, shippingMethodCode?: string): Promise<void> {
        if (shippingMethodCode) {
            const shippingMethod = await findShippingMethodByCode(ctx, this.shippingMethodService, shippingMethodCode);
            if (shippingMethod) {
                const eligibleMethods = await this.orderService.getEligibleShippingMethods(ctx, orderId);
                const method = eligibleMethods.find(m => m.id === shippingMethod.id);
                if (method) {
                    await this.orderService.setShippingMethod(ctx, orderId, [shippingMethod.id]);
                    return;
                }
                this.logger.warn(`Shipping method "${shippingMethodCode}" not eligible for order ${String(orderId)}, falling back to auto-resolve`);
            } else {
                this.logger.warn(`Shipping method "${shippingMethodCode}" not found, falling back to auto-resolve`);
            }
        }

        const eligible = await this.orderService.getEligibleShippingMethods(ctx, orderId);
        if (eligible.length > 0) {
            await this.orderService.setShippingMethod(ctx, orderId, [eligible[0].id]);
        } else {
            this.logger.warn(`No eligible shipping methods found for order ${String(orderId)}`);
        }
    }

    /**
     * Add a payment to the order for migration purposes.
     */
    private async addPaymentForMigration(ctx: RequestContext, orderId: ID, paymentMethodCode?: string): Promise<void> {
        let methodCode = paymentMethodCode;

        if (!methodCode) {
            const eligible = await this.orderService.getEligiblePaymentMethods(ctx, orderId);
            if (eligible.length > 0) {
                methodCode = eligible[0].code;
            }
        }

        if (!methodCode) {
            this.logger.warn(`No payment method available for order ${String(orderId)} transition`);
            return;
        }

        const result = await this.orderService.addPaymentToOrder(ctx, orderId, {
            method: methodCode,
            metadata: { migrationTransition: true },
        });

        if (result && typeof result === 'object' && 'errorCode' in result) {
            this.logger.warn(
                `Failed to add payment to order ${String(orderId)}: ${(result as { message?: string; errorCode?: string }).message ?? (result as { errorCode?: string }).errorCode}`,
            );
        }
    }

    /**
     * Create a fulfillment for all order lines and transition it to the target state.
     * Required before the order can transition to Shipped/Delivered states.
     * Vendure auto-transitions the order when the fulfillment reaches Shipped or Delivered.
     */
    private async addFulfillmentForMigration(
        ctx: RequestContext,
        orderId: ID,
        targetFulfillmentState: 'Shipped' | 'Delivered' = 'Shipped',
    ): Promise<void> {
        const orderLines = await this.connection.getRepository(ctx, OrderLine).find({
            where: { order: { id: orderId } },
        });

        if (orderLines.length === 0) {
            this.logger.warn(`No order lines found for order ${String(orderId)} — cannot create fulfillment`);
            return;
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
        if (fulfillment && typeof fulfillment === 'object' && 'errorCode' in fulfillment) {
            this.logger.warn(
                `Failed to create fulfillment for order ${String(orderId)}: ${(fulfillment as { message?: string; errorCode?: string }).message ?? (fulfillment as { errorCode?: string }).errorCode}`,
            );
            return;
        }

        const fulfillmentId = (fulfillment as { id: ID }).id;

        // Transition fulfillment to Shipped
        const shipped = await this.orderService.transitionFulfillmentToState(
            ctx, fulfillmentId, 'Shipped' as FulfillmentState,
        );
        if (shipped && typeof shipped === 'object' && 'errorCode' in shipped) {
            this.logger.warn(
                `Failed to ship fulfillment for order ${String(orderId)}: ${(shipped as { message?: string; errorCode?: string }).message ?? (shipped as { errorCode?: string }).errorCode}`,
            );
            return;
        }

        // If target is Delivered, also transition fulfillment to Delivered
        if (targetFulfillmentState === 'Delivered') {
            const delivered = await this.orderService.transitionFulfillmentToState(
                ctx, fulfillmentId, 'Delivered' as FulfillmentState,
            );
            if (delivered && typeof delivered === 'object' && 'errorCode' in delivered) {
                this.logger.warn(
                    `Failed to deliver fulfillment for order ${String(orderId)}: ${(delivered as { message?: string; errorCode?: string }).message ?? (delivered as { errorCode?: string }).errorCode}`,
                );
            }
        }
    }
}
