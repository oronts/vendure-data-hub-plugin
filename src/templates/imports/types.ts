/**
 * Import Template Type Definitions
 *
 * This file defines the types used by all import templates.
 * Templates use these types to ensure consistency and type safety.
 */

import { UnifiedPipelineDefinition } from '../../types/index';
import type { JsonObject, TemplateCategory } from '../../../shared/types';

export type { UnifiedPipelineDefinition } from '../../types/index';
export type { TemplateCategory } from '../../../shared/types';

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

/** Single-source metadata for template categories — label, description, and icon in one place */
export const TEMPLATE_CATEGORY_METADATA: Record<TemplateCategory, { label: string; description: string; icon: string }> = {
    products: { label: 'Products', description: 'Import and update product data including variants, pricing, and attributes', icon: 'shopping-bag' },
    customers: { label: 'Customers', description: 'Import customer records with addresses and group assignments', icon: 'users' },
    inventory: { label: 'Inventory', description: 'Update stock levels and manage inventory across locations', icon: 'package' },
    orders: { label: 'Orders', description: 'Import historical orders for data migration', icon: 'receipt' },
    promotions: { label: 'Promotions & Coupons', description: 'Create discount codes and promotional campaigns', icon: 'percent' },
    catalog: { label: 'Catalog Organization', description: 'Set up collections, facets, and category structures', icon: 'folder-tree' },
};

/** Category labels for UI display (auto-derived from TEMPLATE_CATEGORY_METADATA) */
export const CATEGORY_LABELS: Record<TemplateCategory, string> = Object.fromEntries(
    Object.entries(TEMPLATE_CATEGORY_METADATA).map(([k, v]) => [k, v.label]),
) as Record<TemplateCategory, string>;

/** Category descriptions for UI display (auto-derived from TEMPLATE_CATEGORY_METADATA) */
export const CATEGORY_DESCRIPTIONS: Record<TemplateCategory, string> = Object.fromEntries(
    Object.entries(TEMPLATE_CATEGORY_METADATA).map(([k, v]) => [k, v.description]),
) as Record<TemplateCategory, string>;

/** Category icons for UI display (auto-derived from TEMPLATE_CATEGORY_METADATA) */
export const CATEGORY_ICONS: Record<TemplateCategory, string> = Object.fromEntries(
    Object.entries(TEMPLATE_CATEGORY_METADATA).map(([k, v]) => [k, v.icon]),
) as Record<TemplateCategory, string>;

