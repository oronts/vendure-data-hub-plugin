import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface StockLocationInput extends InputRecord {
    /** Stock location name */
    name: string;

    /** Optional description */
    description?: string;

    /** Custom fields */
    customFields?: Record<string, unknown>;
}

export const STOCK_LOCATION_LOADER_METADATA = {
    entityType: VendureEntityType.STOCK_LOCATION,
    name: 'Stock Location Loader',
    description: 'Imports stock locations/warehouses for inventory management',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['name', 'id'],
    requiredFields: ['name'],
} as const;
