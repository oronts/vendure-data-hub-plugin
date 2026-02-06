/**
 * Import Template Type Definitions
 *
 * This file defines the types used by all import templates.
 * Templates use these types to ensure consistency and type safety.
 */

import { UnifiedPipelineDefinition } from '../../types/index';
import type { JsonObject } from '../../../shared/types/json.types';

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
 * Supported file formats for templates
 */
export type TemplateFileFormat = 'csv' | 'json' | 'xml' | 'xlsx';

/**
 * Template tags for filtering and search
 */
export type TemplateTag =
    | 'migration'
    | 'shopify'
    | 'woocommerce'
    | 'magento'
    | 'bulk-update'
    | 'initial-import'
    | 'sync';

/**
 * Template metadata for UI display
 */
export interface ImportTemplate {
    /** Unique template identifier */
    id: string;
    /** Display name */
    name: string;
    /** Detailed description of what this template does */
    description: string;
    /** Category for grouping */
    category: TemplateCategory;
    /** Icon name from lucide-react */
    icon?: string;
    /** Complexity level */
    difficulty: TemplateDifficulty;
    /** Estimated setup time */
    estimatedTime: string;
    /** Fields that must be present in source data */
    requiredFields: string[];
    /** Fields that can optionally be mapped */
    optionalFields: string[];
    /** Example data rows for preview */
    sampleData?: JsonObject[];
    /** Partial pipeline definition to pre-fill wizard */
    definition: Partial<UnifiedPipelineDefinition>;
    /** Supported file formats */
    formats?: TemplateFileFormat[];
    /** Tags for filtering */
    tags?: TemplateTag[];
    /** Link to documentation */
    docsUrl?: string;
    /** Whether template is featured/recommended */
    featured?: boolean;
    /** Order for sorting within category */
    sortOrder?: number;
}

/**
 * Category metadata for UI display
 */
export interface TemplateCategoryInfo {
    category: TemplateCategory;
    label: string;
    description: string;
    icon: string;
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

/**
 * Category descriptions for UI display
 */
export const CATEGORY_DESCRIPTIONS: Record<TemplateCategory, string> = {
    products: 'Import and update product data including variants, pricing, and attributes',
    customers: 'Import customer records with addresses and group assignments',
    inventory: 'Update stock levels and manage inventory across locations',
    orders: 'Import historical orders for data migration',
    promotions: 'Create discount codes and promotional campaigns',
    catalog: 'Set up collections, facets, and category structures',
};

/**
 * Category icons for UI display
 */
export const CATEGORY_ICONS: Record<TemplateCategory, string> = {
    products: 'shopping-bag',
    customers: 'users',
    inventory: 'package',
    orders: 'receipt',
    promotions: 'percent',
    catalog: 'folder-tree',
};

/**
 * Difficulty labels for UI display
 */
export const DIFFICULTY_LABELS: Record<TemplateDifficulty, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
};

/**
 * Difficulty colors for UI display
 */
export const DIFFICULTY_COLORS: Record<TemplateDifficulty, string> = {
    beginner: 'green',
    intermediate: 'yellow',
    advanced: 'red',
};
