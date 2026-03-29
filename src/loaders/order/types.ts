import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface OrderLineInput {
    /** Product variant SKU */
    sku: string;
    /** Quantity ordered */
    quantity: number;
    /** Unit price in minor units (informational - Vendure uses variant configured price at time of import) */
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
    /** Code of the payment method for migration (needed to walk order state machine past ArrangingPayment) */
    paymentMethodCode?: string;
    /** Target order state after import */
    state?: string;
    /** Original order placement date (ISO 8601) */
    orderPlacedAt?: string | Date;
    /** Custom field values */
    customFields?: Record<string, unknown>;
    /** Additional metadata from source system (informational - use customFields to persist on the Vendure order) */
    metadata?: Record<string, unknown>;
}

/**
 * State precedence for ordering comparisons when walking the order state machine.
 * Vendure 3.x removed ArrangingShipping - orders go directly from AddingItems to ArrangingPayment.
 */
export const STATE_RANK: Record<string, number> = {
    'Created': 0, 'Draft': 0, 'AddingItems': 1,
    'ArrangingPayment': 2,
    'PaymentAuthorized': 3, 'PaymentSettled': 4,
    'PartiallyShipped': 5, 'Shipped': 6,
    'PartiallyDelivered': 7, 'Delivered': 8,
};

export const ORDER_LOADER_METADATA = {
    entityType: VendureEntityType.ORDER,
    name: 'Order Loader',
    description: 'Imports orders for system migrations (not for normal order processing)',
    adapterCode: 'orderUpsert',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT'] as TargetOperation[],
    lookupFields: ['code', 'id'],
    requiredFields: ['customerEmail', 'lines'],
} as const;
