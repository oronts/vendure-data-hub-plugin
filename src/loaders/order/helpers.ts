import { ID, RequestContext, CustomerService, ShippingMethodService, OrderService, ProductVariantService } from '@vendure/core';
import { OrderLineInput } from './types';
import { LinesMode } from '../../../shared/types';
import { DataHubLogger } from '../../services/logger/datahub-logger';

export { isRecoverableError, shouldUpdateField, findVariantBySku } from '../shared-helpers';
import {
    assertVendureMutationSucceeded,
    findVariantBySku,
} from '../shared-helpers';

export async function findCustomerByEmail(
    ctx: RequestContext,
    customerService: CustomerService,
    email: string,
): Promise<{ id: ID } | null> {
    const customers = await customerService.findAll(ctx, {
        filter: { emailAddress: { eq: email } },
    });
    return customers.totalItems > 0 ? { id: customers.items[0].id } : null;
}

export async function findShippingMethodByCode(
    ctx: RequestContext,
    shippingMethodService: ShippingMethodService,
    code: string,
): Promise<{ id: ID } | null> {
    const methods = await shippingMethodService.findAll(ctx, {
        filter: { code: { eq: code } },
    });
    return methods.totalItems > 0 ? { id: methods.items[0].id } : null;
}

/**
 * Handle order lines based on the specified mode.
 *
 * @param ctx Request context
 * @param orderService Order service instance
 * @param productVariantService Product variant service instance
 * @param orderId ID of the order to update
 * @param lines New line items from the import record
 * @param mode How to handle the lines (REPLACE_ALL, MERGE_BY_SKU, APPEND_ONLY, SKIP)
 * @param logger Logger instance
 */
export async function handleOrderLines(
    ctx: RequestContext,
    orderService: OrderService,
    productVariantService: ProductVariantService,
    orderId: ID,
    lines: OrderLineInput[],
    mode: LinesMode = 'REPLACE_ALL',
    logger: DataHubLogger,
): Promise<void> {
    if (mode === 'SKIP') {
        return;
    }

    const resolvedLines: Array<OrderLineInput & { quantity: number; variantId: ID }> = [];
    for (const line of lines) {
        const quantity = Number(line.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
            throw new Error(`Order line for SKU "${line.sku}" requires a positive whole quantity`);
        }
        const variant = await findVariantBySku(productVariantService, ctx, line.sku);
        if (!variant) {
            throw new Error(`Variant with SKU "${line.sku}" was not found`);
        }
        resolvedLines.push({ ...line, quantity, variantId: variant.id });
    }

    const addLine = async (
        line: OrderLineInput & { quantity: number; variantId: ID },
    ): Promise<void> => {
        const result = await orderService.addItemToOrder(
            ctx,
            orderId,
            line.variantId,
            line.quantity,
            line.customFields,
        );
        assertVendureMutationSucceeded(`add SKU "${line.sku}"`, result);
    };

    // Guard: cannot modify lines on orders in non-modifiable states (produces SQL NaN errors)
    const nonModifiableStates = new Set([
        'Shipped', 'PartiallyShipped', 'Delivered', 'PartiallyDelivered',
        'Fulfilled', 'PartiallyFulfilled', 'Cancelled',
    ]);
    const checkOrder = await orderService.findOne(ctx, orderId, ['lines']);
    if (checkOrder && nonModifiableStates.has(checkOrder.state)) {
        throw new Error(`Cannot modify lines on order ${orderId} in state ${checkOrder.state}`);
    }

    switch (mode) {
        case 'APPEND_ONLY':
            for (const line of resolvedLines) {
                await addLine(line);
            }
            break;

        case 'MERGE_BY_SKU': {
            // Smart merge: add quantities for existing SKUs, add new SKUs
            const order = await orderService.findOne(ctx, orderId, ['lines', 'lines.productVariant']);
            if (!order || !order.lines) {
                // No existing lines, just add all
                for (const line of resolvedLines) {
                    await addLine(line);
                }
                return;
            }

            // Build SKU map from existing order lines
            const existingBySku = new Map(
                order.lines.map(line => [line.productVariant.sku, line])
            );

            for (const newLine of resolvedLines) {
                const existing = existingBySku.get(newLine.sku);
                if (existing) {
                    if (!existing.id) {
                        throw new Error(`Existing order line for SKU "${newLine.sku}" has no ID`);
                    }
                    const newQuantity = existing.quantity + newLine.quantity;
                    const result = await orderService.adjustOrderLine(
                        ctx,
                        orderId,
                        existing.id,
                        newQuantity,
                        newLine.customFields,
                    );
                    assertVendureMutationSucceeded(`merge SKU "${newLine.sku}"`, result);
                    logger.debug(`Merged line for SKU "${newLine.sku}": ${existing.quantity} + ${newLine.quantity} = ${newQuantity}`);
                } else {
                    await addLine(newLine);
                }
            }
            break;
        }

        case 'REPLACE_ALL': {
            const existingOrder = await orderService.findOne(ctx, orderId, ['lines']);

            if (existingOrder?.lines && existingOrder.lines.length > 0) {
                const missingId = existingOrder.lines.find(line => !line.id);
                if (missingId) {
                    throw new Error(`Cannot replace order lines because an existing line has no ID`);
                }
                for (const line of existingOrder.lines) {
                    const result = await orderService.adjustOrderLine(ctx, orderId, line.id, 0);
                    assertVendureMutationSucceeded('remove existing line', result);
                }
                logger.debug(`Removed ${existingOrder.lines.length} existing order lines`);
            }

            for (const line of resolvedLines) {
                await addLine(line);
            }
            break;
        }
    }
}
