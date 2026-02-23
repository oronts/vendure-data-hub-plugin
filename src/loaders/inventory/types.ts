import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface InventoryInput extends InputRecord {
    /** Product SKU to look up */
    sku: string;

    /** Stock on hand value */
    stockOnHand: number;

    /** Stock location name (optional) */
    stockLocationName?: string;

    /** Stock location ID (alternative to name) */
    stockLocationId?: string | number;

    /** Reason for stock adjustment */
    reason?: string;
}

export const INVENTORY_LOADER_METADATA = {
    entityType: VendureEntityType.INVENTORY,
    name: 'Inventory Loader',
    description: 'Updates stock levels for product variants by SKU',
    adapterCode: 'inventoryAdjust',
    supportedOperations: ['UPDATE', 'UPSERT'] as TargetOperation[],
    lookupFields: ['sku'],
    requiredFields: ['sku', 'stockOnHand'],
} as const;
