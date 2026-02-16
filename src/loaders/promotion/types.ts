import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface PromotionConditionInput {
    /** Condition handler code */
    code: string;
    /** Arguments for the condition */
    args: Record<string, unknown>;
}

export interface PromotionActionInput {
    /** Action handler code */
    code: string;
    /** Arguments for the action */
    args: Record<string, unknown>;
}

export interface PromotionInput extends InputRecord {
    /** Display name for the promotion */
    name: string;
    /** Description shown to customers */
    description?: string;
    /** Code customers enter at checkout (leave empty for automatic promotions) */
    couponCode?: string;
    /** Maximum uses per customer (0 = unlimited) */
    perCustomerUsageLimit?: number;
    /** Maximum total uses (0 = unlimited) */
    usageLimit?: number;
    /** When promotion becomes active (ISO 8601) */
    startsAt?: string | Date;
    /** When promotion expires (ISO 8601) */
    endsAt?: string | Date;
    /** Whether promotion is active */
    enabled?: boolean;
    /** Conditions that must be met to apply promotion */
    conditions?: PromotionConditionInput[];
    /** Discount actions to apply */
    actions?: PromotionActionInput[];
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export const PROMOTION_LOADER_METADATA = {
    entityType: VendureEntityType.PROMOTION,
    name: 'Promotion Loader',
    description: 'Imports promotions, discounts, and coupon codes',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['couponCode', 'id', 'name'],
    requiredFields: ['name'],
} as const;

/**
 * Default promotion action used when no actions are specified.
 * This is a placeholder 0% discount to satisfy Vendure's requirement
 * that promotions must have at least one action.
 */
export const DEFAULT_PROMOTION_ACTION: { code: string; arguments: { name: string; value: string }[] } = {
    code: 'order_percentage_discount',
    arguments: [{ name: 'discount', value: '0' }],
};
