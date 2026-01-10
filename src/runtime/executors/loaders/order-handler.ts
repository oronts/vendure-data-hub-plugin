/**
 * Order-related loader handlers (orderNote, applyCoupon, orderTransition)
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    OrderService,
    TransactionalConnection,
    Order,
} from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';

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
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        for (const rec of input) {
            try {
                const orderIdField = (step.config as any)?.orderIdField ?? 'orderId';
                const orderCodeField = (step.config as any)?.orderCodeField ?? 'orderCode';
                const noteField = (step.config as any)?.noteField ?? 'note';
                const isPrivate = Boolean((step.config as any)?.isPrivate ?? false);
                const orderId = (rec as any)?.[orderIdField] as string | undefined;
                const orderCode = (rec as any)?.[orderCodeField] as string | undefined;
                const note = String((rec as any)?.[noteField] ?? '') || undefined;

                if (!note) { fail++; continue; }

                let targetOrderId: any = orderId;
                if (!targetOrderId && orderCode) {
                    const found = await this.connection.getRepository(ctx, Order as any).findOne({ where: { code: orderCode } } as any);
                    targetOrderId = (found as any)?.id;
                }

                if (!targetOrderId) { fail++; continue; }
                await this.orderService.addNoteToOrder(ctx, { orderId: targetOrderId, note, isPublic: !isPrivate } as any);
                ok++;
            } catch (e: any) {
                if (onRecordError) {
                    await onRecordError(step.key, e?.message ?? 'orderNote failed', rec as any);
                }
                fail++;
            }
        }
        return { ok, fail };
    }
}

@Injectable()
export class ApplyCouponHandler implements LoaderHandler {
    constructor(
        private orderService: OrderService,
        private connection: TransactionalConnection,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        for (const rec of input) {
            try {
                const orderIdField = (step.config as any)?.orderIdField ?? 'orderId';
                const orderCodeField = (step.config as any)?.orderCodeField ?? 'orderCode';
                const couponField = (step.config as any)?.couponField ?? 'coupon';
                let orderId = (rec as any)?.[orderIdField] as string | undefined;
                const code = (rec as any)?.[orderCodeField] as string | undefined;
                const coupon = String((rec as any)?.[couponField] ?? '') || undefined;

                if (!coupon) { fail++; continue; }
                if (!orderId && code) {
                    const found = await this.connection.getRepository(ctx, Order as any).findOne({ where: { code } } as any);
                    orderId = (found as any)?.id;
                }
                if (!orderId) { fail++; continue; }

                await this.orderService.applyCouponCode(ctx, orderId as any, coupon);
                ok++;
            } catch (e: any) {
                if (onRecordError) {
                    await onRecordError(step.key, e?.message ?? 'applyCoupon failed', rec as any);
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
    ): Promise<Record<string, any>> {
        let ordersFound = 0;
        for (const rec of input) {
            const orderId = (rec as any)?.[(step.config as any)?.orderIdField ?? 'orderId'] as any;
            const orderCode = (rec as any)?.[(step.config as any)?.orderCodeField ?? 'orderCode'] as string | undefined;
            if (orderId) { ordersFound++; continue; }
            if (orderCode) {
                try {
                    const found = await this.connection.getRepository(ctx, Order as any).findOne({ where: { code: orderCode } } as any);
                    if (found) ordersFound++;
                } catch {}
            }
        }
        return { ordersFound };
    }
}

@Injectable()
export class OrderTransitionHandler implements LoaderHandler {
    constructor(
        private orderService: OrderService,
        private connection: TransactionalConnection,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        _onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        for (const rec of input) {
            try {
                const orderIdField = (step.config as any)?.orderIdField ?? 'orderId';
                const orderCodeField = (step.config as any)?.orderCodeField ?? 'orderCode';
                const state = String((step.config as any)?.state ?? '');
                let orderId = (rec as any)?.[orderIdField] as any;
                const code = (rec as any)?.[orderCodeField] as string | undefined;

                if (!orderId && code) {
                    const found = await this.connection.getRepository(ctx, Order as any).findOne({ where: { code } } as any);
                    orderId = (found as any)?.id;
                }
                if (!orderId || !state) { fail++; continue; }

                await this.orderService.transitionToState(ctx, orderId as any, state as any);
                ok++;
            } catch {
                fail++;
            }
        }
        return { ok, fail };
    }
}
