import { ID, CustomerGroup } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';

export interface CustomerGroupInput extends InputRecord {
    /** Unique name for the customer group */
    name: string;
    /** Email addresses of customers to add to this group */
    customerEmails?: string[];
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: CustomerGroup;
}

export const CUSTOMER_GROUP_LOADER_METADATA = {
    entityType: 'CustomerGroup' as const,
    name: 'Customer Group Loader',
    description: 'Imports customer groups/segments with customer assignment',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['name', 'id'],
    requiredFields: ['name'],
} as const;
