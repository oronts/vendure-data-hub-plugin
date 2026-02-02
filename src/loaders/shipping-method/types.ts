import { ID, ShippingMethod } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface ShippingCalculatorInput {
    /** Calculator handler code */
    code: string;
    /** Arguments for the calculator */
    args: Record<string, unknown>;
}

export interface ShippingCheckerInput {
    /** Checker handler code */
    code: string;
    /** Arguments for the checker */
    args: Record<string, unknown>;
}

export interface ShippingMethodInput extends InputRecord {
    /** Display name for the shipping method */
    name: string;
    /** Unique code for the shipping method */
    code: string;
    /** Description shown to customers */
    description?: string;
    /** Code of the fulfillment handler to use */
    fulfillmentHandler: string;
    /** Calculator configuration for shipping rates */
    calculator: ShippingCalculatorInput;
    /** Optional checker to determine eligibility */
    checker?: ShippingCheckerInput;
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export interface ConfigurableOperationInput {
    code: string;
    arguments: Array<{ name: string; value: string }>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: ShippingMethod;
}

export const SHIPPING_METHOD_LOADER_METADATA = {
    entityType: VendureEntityType.SHIPPING_METHOD,
    name: 'Shipping Method Loader',
    description: 'Imports shipping methods with calculators and checkers',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['code', 'id', 'name'],
    requiredFields: ['name', 'code', 'fulfillmentHandler', 'calculator'],
} as const;
