import { Injectable } from '@nestjs/common';
import {
    OrderService,
    RequestContext,
    ShippingMethodService,
    TransactionalConnection,
} from '@vendure/core';
import { STATE_RANK } from '../../../loaders/order/types';
import {
    isPartialFulfillmentState,
    OrderMigrationLifecycle,
} from '../../../loaders/order/order-migration-lifecycle';
import { getStringValue } from '../../../loaders/shared-helpers';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import type { ErrorHandlingConfig, PipelineStepDefinition } from '../../../types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import type {
    LoaderExecutionResult,
    OnRecordErrorCallback,
    RecordObject,
} from '../../executor-types';
import {
    getOrderTransitionConfig,
    resolveOrder,
} from './order-handler-support';
import type { LoaderHandler } from './types';

@Injectable()
export class OrderTransitionHandler implements LoaderHandler {
    private readonly lifecycle: OrderMigrationLifecycle;

    constructor(
        private readonly orderService: OrderService,
        private readonly connection: TransactionalConnection,
        shippingMethodService: ShippingMethodService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.lifecycle = new OrderMigrationLifecycle({
            orderService,
            connection,
            shippingMethodService,
            logger: loggerFactory.createLogger(LOGGER_CONTEXTS.ORDER_LOADER),
        });
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0;
        let fail = 0;
        const config = getOrderTransitionConfig(step.config);

        for (const record of input) {
            const state = (config.stateField
                ? getStringValue(record, config.stateField)
                : undefined) ?? config.state;
            try {
                if (!state) {
                    throw new Error('Order transition requires a target state');
                }
                await this.connection.withTransaction(ctx, async transactionCtx => {
                    const order = await resolveOrder(
                        this.orderService,
                        transactionCtx,
                        record,
                        config.orderIdField,
                        config.orderCodeField,
                    );
                    if (!order) {
                        throw new Error('Order ID or code did not resolve to an order');
                    }
                    if (isPartialFulfillmentState(state) && order.state !== state) {
                        throw new Error(
                            `Cannot transition order ${String(order.id)} to "${state}" without per-line fulfillment quantities`,
                        );
                    }
                    const targetRank = STATE_RANK[state];
                    const currentRank = STATE_RANK[order.state] ?? -1;
                    if (targetRank !== undefined && targetRank >= 2 && currentRank < 2) {
                        await this.lifecycle.ensureShippingMethod(
                            transactionCtx,
                            order.id,
                            config.shippingMethodCode,
                        );
                    }
                    const transitioned = await this.lifecycle.transitionToTarget(
                        transactionCtx,
                        order.id,
                        state,
                        {
                            paymentMethodCode: config.paymentMethodCode,
                            paymentMetadata: { migrationTransition: true },
                        },
                    );
                    if (!transitioned) {
                        throw new Error(`Failed to transition order ${String(order.id)} to "${state}"`);
                    }
                });
                ok++;
            } catch (error) {
                await onRecordError?.(
                    step.key,
                    getErrorMessage(error),
                    record,
                    getErrorStack(error),
                );
                fail++;
            }
        }
        return { ok, fail, skipped: 0 };
    }
}
