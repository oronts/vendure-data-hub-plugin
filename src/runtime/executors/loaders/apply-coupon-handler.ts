import { Injectable } from '@nestjs/common';
import { OrderService, RequestContext, type Order } from '@vendure/core';
import { getVendureMutationError } from '../../../loaders/order/order-migration-lifecycle';
import { getStringValue } from '../../../loaders/shared-helpers';
import type { ErrorHandlingConfig, PipelineStepDefinition } from '../../../types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import type {
    LoaderExecutionResult,
    OnRecordErrorCallback,
    RecordObject,
} from '../../executor-types';
import {
    getApplyCouponConfig,
    getOrderReference,
    resolveOrder,
} from './order-handler-support';
import {
    createSimulationDetail,
    getSimulationRecordId,
    summarizeSimulationDetails,
    toSimulationObject,
} from './loader-simulation';
import type { LoaderHandler, LoaderSimulationResult } from './types';

@Injectable()
export class ApplyCouponHandler implements LoaderHandler {
    constructor(private readonly orderService: OrderService) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0;
        let fail = 0;
        const config = getApplyCouponConfig(step.config);

        for (const record of input) {
            try {
                const coupon = getStringValue(record, config.couponField)?.trim();
                if (!coupon) {
                    throw new Error(`Missing required coupon field "${config.couponField}"`);
                }
                const order = await resolveOrder(
                    this.orderService,
                    ctx,
                    record,
                    config.orderIdField,
                    config.orderCodeField,
                );
                if (!order) {
                    throw new Error('Order ID or code did not resolve to an order');
                }
                const error = getVendureMutationError(
                    await this.orderService.applyCouponCode(ctx, order.id, coupon),
                );
                if (error) {
                    throw new Error(`Failed to apply coupon "${coupon}": ${error}`);
                }
                ok++;
            } catch (error) {
                await onRecordError?.(
                    step.key,
                    getErrorMessage(error) || 'applyCoupon failed',
                    record,
                    getErrorStack(error),
                );
                fail++;
            }
        }
        return { ok, fail, skipped: 0 };
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<LoaderSimulationResult> {
        const config = getApplyCouponConfig(step.config);
        const recordDetails = [];

        for (let index = 0; index < input.length; index++) {
            const record = input[index];
            const reference = getOrderReference(
                record,
                config.orderIdField,
                config.orderCodeField,
            );
            const coupon = getStringValue(record, config.couponField);
            const existing = reference === undefined
                ? undefined
                : await resolveOrder(
                    this.orderService,
                    ctx,
                    record,
                    config.orderIdField,
                    config.orderCodeField,
                );
            const recordId = String(reference ?? getSimulationRecordId(record) ?? `order-${index + 1}`);
            const validationErrors = [];
            if (reference === undefined) validationErrors.push('Order ID or code is required');
            if (!coupon) validationErrors.push(`Missing required coupon field "${config.couponField}"`);
            if (reference !== undefined && !existing) validationErrors.push(`Order ${recordId} was not found`);
            recordDetails.push(createSimulationDetail({
                recordId,
                entityType: 'Order',
                operation: validationErrors.length > 0 ? 'ERROR' : 'UPDATE',
                currentState: toSimulationObject(existing as Order | undefined),
                proposedState: toSimulationObject(record) ?? {},
                validationErrors,
            }));
        }

        return {
            supported: true,
            recordsIn: input.length,
            recordDetails,
            ...summarizeSimulationDetails(recordDetails),
        };
    }
}
