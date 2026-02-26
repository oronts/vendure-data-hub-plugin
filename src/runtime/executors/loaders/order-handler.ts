/**
 * Order-related loader handlers (orderNote, applyCoupon, orderTransition)
 */
import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    OrderService,
    TransactionalConnection,
    Order,
} from '@vendure/core';
import type { ID } from '@vendure/common/lib/shared-types';
import type { AddNoteToOrderInput } from '@vendure/common/lib/generated-types';
import type { OrderState } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getStringValue, getIdValue } from '../../../loaders/shared-helpers';

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
    state?: string;
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
    private readonly logger = new Logger(ApplyCouponHandler.name);

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
    private readonly logger = new Logger(OrderTransitionHandler.name);

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
        const handlerConfig = getOrderTransitionConfig(step.config);
        const orderIdField = handlerConfig.orderIdField ?? 'orderId';
        const orderCodeField = handlerConfig.orderCodeField ?? 'orderCode';
        const state = handlerConfig.state ?? '';

        for (const rec of input) {
            let orderId = getIdValue(rec, orderIdField);
            const code = getStringValue(rec, orderCodeField);

            try {
                if (!orderId && code) {
                    const found = await this.connection.getRepository(ctx, Order).findOne({ where: { code } });
                    orderId = found?.id;
                }
                if (!orderId || !state) { fail++; continue; }

                await this.orderService.transitionToState(ctx, orderId, state as OrderState);
                ok++;
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
}
