import { ID, Promotion } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';

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

export interface ConfigurableOperationInput {
    code: string;
    arguments: Array<{ name: string; value: string }>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: Promotion;
}

export const PROMOTION_LOADER_METADATA = {
    entityType: 'Promotion' as const,
    name: 'Promotion Loader',
    description: 'Imports promotions, discounts, and coupon codes',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['couponCode', 'id', 'name'],
    requiredFields: ['name'],
} as const;
