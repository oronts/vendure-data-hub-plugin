import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

/**
 * Configurable Operation Input for payment handlers/checkers
 */
export interface ConfigurableOperationInput {
    /** Handler/checker code */
    code: string;
    /** Arguments for the handler/checker */
    args: Record<string, unknown>;
}

/**
 * Payment Method Input for data import
 *
 * Represents the input data structure for creating or updating payment methods.
 * Payment methods define how customers can pay for orders.
 */
export interface PaymentMethodInput extends InputRecord {
    /** Display name for the payment method */
    name: string;

    /** Unique code for the payment method */
    code: string;

    /** Description shown to customers */
    description?: string;

    /** Whether this payment method is enabled */
    enabled?: boolean;

    /** Payment handler configuration */
    handler: ConfigurableOperationInput;

    /** Eligibility checker configuration (optional) */
    checker?: ConfigurableOperationInput;

    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export const PAYMENT_METHOD_LOADER_METADATA = {
    entityType: VendureEntityType.PAYMENT_METHOD,
    name: 'Payment Method Loader',
    description: 'Imports payment methods with handlers and eligibility checkers',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['code', 'id', 'name'],
    requiredFields: ['name', 'code', 'handler'],
} as const;
