import { InputRecord } from '../../types/index';

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
