export interface VendureEventConfig {
    readonly event: string;
    readonly label: string;
    readonly description: string;
    readonly category: string;
}

export const VENDURE_EVENTS: readonly VendureEventConfig[] = [
    { event: 'ProductEvent', label: 'Product Changed', description: 'Any product change', category: 'Catalog' },
    { event: 'ProductVariantEvent', label: 'Variant Changed', description: 'Any variant change', category: 'Catalog' },
    { event: 'ProductVariantPriceEvent', label: 'Price Changed', description: 'Variant price updated', category: 'Catalog' },
    { event: 'CollectionModificationEvent', label: 'Collection Modified', description: 'Collection changed', category: 'Catalog' },
    { event: 'AssetEvent', label: 'Asset Changed', description: 'Asset created/updated', category: 'Catalog' },
    { event: 'StockMovementEvent', label: 'Stock Movement', description: 'Stock level changed', category: 'Inventory' },
    { event: 'OrderStateTransitionEvent', label: 'Order State Changed', description: 'Order transitioned', category: 'Orders' },
    { event: 'OrderPlacedEvent', label: 'Order Placed', description: 'New order placed', category: 'Orders' },
    { event: 'RefundStateTransitionEvent', label: 'Refund State Changed', description: 'Refund transitioned', category: 'Orders' },
    { event: 'PaymentStateTransitionEvent', label: 'Payment State Changed', description: 'Payment transitioned', category: 'Orders' },
    { event: 'CustomerEvent', label: 'Customer Changed', description: 'Customer created/updated', category: 'Customers' },
    { event: 'AccountRegistrationEvent', label: 'Account Registered', description: 'New account registered', category: 'Customers' },
    { event: 'CustomerAddressEvent', label: 'Address Changed', description: 'Customer address updated', category: 'Customers' },
] as const;

export const VENDURE_EVENTS_BY_CATEGORY = VENDURE_EVENTS.reduce<Record<string, VendureEventConfig[]>>(
    (acc, event) => {
        if (!acc[event.category]) {
            acc[event.category] = [];
        }
        acc[event.category].push(event);
        return acc;
    },
    {}
);
