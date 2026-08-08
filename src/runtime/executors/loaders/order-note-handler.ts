import type { AddNoteToOrderInput } from '@vendure/common/lib/generated-types';
import { Injectable } from '@nestjs/common';
import { OrderService, RequestContext } from '@vendure/core';
import type { ErrorHandlingConfig, PipelineStepDefinition } from '../../../types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import type {
    LoaderExecutionResult,
    OnRecordErrorCallback,
    RecordObject,
} from '../../executor-types';
import { getStringValue } from '../../../loaders/shared-helpers';
import { getOrderNoteConfig, resolveOrder } from './order-handler-support';
import type { LoaderHandler } from './types';

@Injectable()
export class OrderNoteHandler implements LoaderHandler {
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
        const config = getOrderNoteConfig(step.config);

        for (const record of input) {
            try {
                const note = getStringValue(record, config.noteField)?.trim();
                if (!note) {
                    throw new Error(`Missing required note field "${config.noteField}"`);
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

                const noteInput: AddNoteToOrderInput = {
                    id: order.id,
                    note,
                    isPublic: !config.isPrivate,
                };
                await this.orderService.addNoteToOrder(ctx, noteInput);
                ok++;
            } catch (error) {
                await onRecordError?.(
                    step.key,
                    getErrorMessage(error) || 'orderNote failed',
                    record,
                    getErrorStack(error),
                );
                fail++;
            }
        }
        return { ok, fail, skipped: 0 };
    }
}
