import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

/**
 * Tax Rate Input for data import
 *
 * Represents the input data structure for creating or updating tax rates.
 * Tax rates define the percentage of tax applied to products in specific zones.
 */
export interface TaxRateInput extends InputRecord {
    /** Display name for the tax rate */
    name: string;

    /** Tax rate percentage (e.g., 20 for 20%) */
    value: number;

    /** Whether this tax rate is enabled */
    enabled?: boolean;

    /** Code stored in the tax category customFields.code field */
    taxCategoryCode?: string;

    /** ID of the tax category (alternative to taxCategoryCode) */
    taxCategoryId?: string | number;

    /** Code stored in the zone customFields.code field */
    zoneCode?: string;

    /** ID of the zone (alternative to zoneCode) */
    zoneId?: string | number;

    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export const TAX_RATE_LOADER_METADATA = {
    entityType: VendureEntityType.TAX_RATE,
    name: 'Tax Rate Loader',
    description: 'Imports tax rates with tax category and zone resolution',
    adapterCode: 'taxRateUpsert',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT'] as TargetOperation[],
    lookupFields: ['name', 'id'],
    requiredFields: ['name', 'value'],
} as const;
