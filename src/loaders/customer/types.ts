import { ID, Customer } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';

export interface CustomerAddressInput {
    fullName?: string;
    streetLine1: string;
    streetLine2?: string;
    city: string;
    province?: string;
    postalCode: string;
    countryCode: string;
    phoneNumber?: string;
    defaultShippingAddress?: boolean;
    defaultBillingAddress?: boolean;
}

export interface CustomerInput extends InputRecord {
    /** Unique email address */
    emailAddress: string;
    /** Customer first name */
    firstName: string;
    /** Customer last name */
    lastName: string;
    /** Contact phone number */
    phoneNumber?: string;
    /** Title (Mr, Mrs, etc.) */
    title?: string;
    /** Array of customer group codes to assign */
    groupCodes?: string[];
    /** Array of customer addresses */
    addresses?: CustomerAddressInput[];
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: Customer;
}

export const CUSTOMER_LOADER_METADATA = {
    entityType: 'Customer' as const,
    name: 'Customer Loader',
    description: 'Imports customers with email-based lookup, addresses, and group assignment',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['emailAddress', 'id', 'customFields.externalId'],
    requiredFields: ['emailAddress', 'firstName', 'lastName'],
} as const;
