import { ID, Order } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface OrderLineInput {
    /** Product variant SKU */
    sku: string;
    /** Quantity ordered */
    quantity: number;
    /** Override price (uses variant price if not set) */
    unitPrice?: number;
    /** Custom field values for the line */
    customFields?: Record<string, unknown>;
}

export interface OrderAddressInput {
    fullName?: string;
    company?: string;
    streetLine1: string;
    streetLine2?: string;
    city: string;
    province?: string;
    postalCode: string;
    countryCode: string;
    phoneNumber?: string;
}

export interface OrderInput extends InputRecord {
    /** Unique order code (auto-generated if not provided) */
    code?: string;
    /** Email of the customer placing the order */
    customerEmail: string;
    /** Array of line items */
    lines: OrderLineInput[];
    /** Shipping address details */
    shippingAddress?: OrderAddressInput;
    /** Billing address (defaults to shipping if not provided) */
    billingAddress?: OrderAddressInput;
    /** Code of the shipping method to use */
    shippingMethodCode?: string;
    /** Target order state after import */
    state?: string;
    /** Original order placement date (ISO 8601) */
    orderPlacedAt?: string | Date;
    /** Custom field values */
    customFields?: Record<string, unknown>;
    /** Additional metadata from source system */
    metadata?: Record<string, unknown>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: Order;
}

export const ORDER_LOADER_METADATA = {
    entityType: VendureEntityType.ORDER,
    name: 'Order Loader',
    description: 'Imports orders for system migrations (not for normal order processing)',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT'] as TargetOperation[],
    lookupFields: ['code', 'id'],
    requiredFields: ['customerEmail', 'lines'],
} as const;
