import type { ID } from '@vendure/common/lib/shared-types';
import type { Order, OrderService, RequestContext } from '@vendure/core';
import type { JsonObject } from '../../../types';
import { getIdValue, getStringValue } from '../../../loaders/shared-helpers';
import type { RecordObject } from '../../executor-types';

export interface OrderNoteHandlerConfig {
    orderIdField: string;
    orderCodeField: string;
    noteField: string;
    isPrivate: boolean;
}

export interface ApplyCouponHandlerConfig {
    orderIdField: string;
    orderCodeField: string;
    couponField: string;
}

export interface OrderTransitionHandlerConfig {
    orderIdField: string;
    orderCodeField: string;
    state: string;
    stateField?: string;
    shippingMethodCode?: string;
    paymentMethodCode?: string;
}

export function getOrderNoteConfig(config: JsonObject): OrderNoteHandlerConfig {
    return {
        orderIdField: stringConfig(config.orderIdField, 'orderId'),
        orderCodeField: stringConfig(config.orderCodeField, 'orderCode'),
        noteField: stringConfig(config.noteField, 'note'),
        isPrivate: typeof config.isPrivate === 'boolean' ? config.isPrivate : false,
    };
}

export function getApplyCouponConfig(config: JsonObject): ApplyCouponHandlerConfig {
    return {
        orderIdField: stringConfig(config.orderIdField, 'orderId'),
        orderCodeField: stringConfig(config.orderCodeField, 'orderCode'),
        couponField: stringConfig(config.couponField, 'coupon'),
    };
}

export function getOrderTransitionConfig(config: JsonObject): OrderTransitionHandlerConfig {
    return {
        orderIdField: stringConfig(config.orderIdField, 'orderId'),
        orderCodeField: stringConfig(config.orderCodeField, 'orderCode'),
        state: stringConfig(config.state, ''),
        stateField: optionalString(config.stateField),
        shippingMethodCode: optionalString(config.shippingMethodCode),
        paymentMethodCode: optionalString(config.paymentMethodCode),
    };
}

export async function resolveOrder(
    orderService: OrderService,
    ctx: RequestContext,
    record: RecordObject,
    orderIdField: string,
    orderCodeField: string,
): Promise<Order | undefined> {
    const orderId = getIdValue(record, orderIdField);
    if (orderId !== undefined) {
        return (await orderService.findOne(ctx, orderId)) ?? undefined;
    }
    const orderCode = getStringValue(record, orderCodeField);
    return orderCode
        ? (await orderService.findOneByCode(ctx, orderCode)) ?? undefined
        : undefined;
}

export function getOrderReference(
    record: RecordObject,
    orderIdField: string,
    orderCodeField: string,
): ID | string | undefined {
    return getIdValue(record, orderIdField) ?? getStringValue(record, orderCodeField);
}

function stringConfig(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}
