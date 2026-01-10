/**
 * Import Template Type Definitions
 *
 * This file defines the types used by all import templates.
 * Templates use these types to ensure consistency and type safety.
 */

import { UnifiedPipelineDefinition } from '../../types/index';

export type { UnifiedPipelineDefinition } from '../../types/index';

/**
 * Template category types
 */
export type TemplateCategory =
    | 'products'
    | 'customers'
    | 'inventory'
    | 'orders'
    | 'promotions'
    | 'catalog';

/**
 * Difficulty levels for templates
 */
export type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Template metadata for UI display
 */
export interface ImportTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    icon?: string;
    difficulty: TemplateDifficulty;
    estimatedTime: string;
    requiredFields: string[];
    optionalFields: string[];
    sampleData?: Record<string, any>[];
    definition: Partial<UnifiedPipelineDefinition>;
}

/**
 * Category labels for UI display
 */
export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
    products: 'Products',
    customers: 'Customers',
    inventory: 'Inventory',
    orders: 'Orders',
    promotions: 'Promotions & Coupons',
    catalog: 'Catalog Organization',
};
