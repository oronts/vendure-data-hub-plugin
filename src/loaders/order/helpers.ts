import { ID, RequestContext, CustomerService, ShippingMethodService, OrderService, ProductVariantService, Order } from '@vendure/core';
import { OrderAddressInput, OrderLineInput } from './types';
import { LinesMode } from '../../../shared/types';
import { DataHubLogger } from '../../services/logger';

export { isRecoverableError, shouldUpdateField, findVariantBySku } from '../shared-helpers';
import { findVariantBySku } from '../shared-helpers';

export function validateAddress(
    address: OrderAddressInput,
    prefix: string,
): { field: string; message: string; code?: string }[] {
    const errors: { field: string; message: string; code?: string }[] = [];

    if (!address.streetLine1) {
        errors.push({ field: `${prefix}.streetLine1`, message: 'Street line 1 is required', code: 'REQUIRED' });
    }
    if (!address.city) {
        errors.push({ field: `${prefix}.city`, message: 'City is required', code: 'REQUIRED' });
    }
    if (!address.postalCode) {
        errors.push({ field: `${prefix}.postalCode`, message: 'Postal code is required', code: 'REQUIRED' });
    }
    if (!address.countryCode) {
        errors.push({ field: `${prefix}.countryCode`, message: 'Country code is required', code: 'REQUIRED' });
    }

    return errors;
}

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

    // Helper to find variant by SKU and add line
    const addLine = async (line: OrderLineInput): Promise<boolean> => {
        const quantity = Number(line.quantity);
        if (isNaN(quantity) || quantity < 0) {
            logger.warn(`Invalid quantity for line: ${JSON.stringify(line)}`);
            return false;
        }
        const variant = await findVariantBySku(productVariantService, ctx, line.sku);
        if (!variant) {
            logger.warn(`Variant with SKU "${line.sku}" not found, skipping line`);
            return false;
        }
        await orderService.addItemToOrder(ctx, orderId, variant.id, quantity);
        return true;
    };

    switch (mode) {
        case 'APPEND_ONLY':
            // Always add new lines (allows duplicates - current behavior)
            for (const line of lines) {
                await addLine(line);
            }
            break;

        case 'MERGE_BY_SKU':
            // Smart merge: add quantities for existing SKUs, add new SKUs
            const order = await orderService.findOne(ctx, orderId, ['lines', 'lines.productVariant']);
            if (!order || !order.lines) {
                // No existing lines, just add all
                for (const line of lines) {
                    await addLine(line);
                }
                return;
            }

            // Build SKU map from existing order lines
            const existingBySku = new Map(
                order.lines.map(line => [line.productVariant.sku, line])
            );

            for (const newLine of lines) {
                const existing = existingBySku.get(newLine.sku);
                if (existing) {
                    // SKU exists: add quantities
                    const parsedQty = Number(newLine.quantity);
                    if (isNaN(parsedQty) || parsedQty < 0) {
                        logger.warn(`Invalid quantity for merge line SKU "${newLine.sku}": ${JSON.stringify(newLine.quantity)}`);
                        continue;
                    }
                    if (!existing.id) {
                        logger.warn(`Existing order line for SKU "${newLine.sku}" has no ID, skipping merge`);
                        continue;
                    }
                    const newQuantity = existing.quantity + parsedQty;
                    await orderService.adjustOrderLine(ctx, orderId, existing.id, newQuantity);
                    logger.debug(`Merged line for SKU "${newLine.sku}": ${existing.quantity} + ${parsedQty} = ${newQuantity}`);
                } else {
                    // New SKU: add line item
                    await addLine(newLine);
                }
            }
            break;

        case 'REPLACE_ALL': {
            // Remove all existing lines, add new ones (destructive)
            const existingOrder = await orderService.findOne(ctx, orderId, ['lines']);

            // Guard: cannot adjust lines on orders in non-modifiable states.
            // Attempting adjustOrderLine on Shipped/Delivered orders produces SQL NaN errors.
            const nonModifiableStates = new Set([
                'Shipped', 'PartiallyShipped', 'Delivered', 'PartiallyDelivered',
                'Fulfilled', 'PartiallyFulfilled', 'Cancelled',
            ]);
            if (existingOrder && nonModifiableStates.has(existingOrder.state)) {
                logger.warn(
                    `Order ${orderId} is in state "${existingOrder.state}" — ` +
                    'REPLACE_ALL line adjustment skipped (order is not modifiable)',
                );
                break;
            }

            if (existingOrder?.lines && existingOrder.lines.length > 0) {
                // Remove all existing lines
                for (const line of existingOrder.lines) {
                    if (!line.id) {
                        logger.warn(`Order line without ID found during REPLACE_ALL, skipping removal`);
                        continue;
                    }
                    await orderService.adjustOrderLine(ctx, orderId, line.id, 0);
                }
                logger.debug(`Removed ${existingOrder.lines.length} existing order lines`);
            }

            // Add new lines
            for (const line of lines) {
                await addLine(line);
            }
            break;
        }
    }
}

