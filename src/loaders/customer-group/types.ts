import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface CustomerGroupInput extends InputRecord {
    /** Unique name for the customer group */
    name: string;
    /** Email addresses of customers to add to this group */
    customerEmails?: string[];
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export const CUSTOMER_GROUP_LOADER_METADATA = {
    entityType: VendureEntityType.CUSTOMER_GROUP,
    name: 'Customer Group Loader',
    description: 'Imports customer groups/segments with customer assignment',
    adapterCode: 'customerGroupUpsert',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['name', 'id'],
    requiredFields: ['name'],
} as const;
