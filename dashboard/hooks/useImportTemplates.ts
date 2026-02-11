/**
 * Hook for accessing import templates
 *
 * Provides template data and utility functions for the import wizard.
 */

import * as React from 'react';

type TemplateCategory = 'products' | 'customers' | 'inventory' | 'orders' | 'promotions' | 'catalog';
type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';

interface ImportTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    icon?: string;
    difficulty: TemplateDifficulty;
    estimatedTime: string;
    requiredFields: string[];
    optionalFields: string[];
    sampleData?: Record<string, unknown>[];
    featured?: boolean;
    tags?: string[];
    formats?: string[];
    definition?: unknown;
}

interface CategoryInfo {
    category: TemplateCategory;
    label: string;
    description: string;
    icon: string;
    count: number;
}

/**
 * Static templates data - loaded from backend module
 * In a production environment, this could be fetched via GraphQL
 */
const TEMPLATES: ImportTemplate[] = [
    // Products
    {
        id: 'simple-products-csv',
        name: 'Simple Products (CSV)',
        description: 'Import basic products with name, SKU, price, and description from a CSV file. Perfect for getting started with product imports.',
        category: 'products',
        icon: 'shopping-bag',
        difficulty: 'beginner',
        estimatedTime: '5 minutes',
        requiredFields: ['name', 'sku', 'price'],
        optionalFields: ['description', 'slug', 'enabled', 'facetCodes'],
        formats: ['CSV'],
        tags: ['initial-import', 'bulk-update'],
        featured: true,
        sampleData: [
            { name: 'Blue T-Shirt', sku: 'TSHIRT-BLU-M', price: '29.99', description: 'Comfortable cotton t-shirt' },
            { name: 'Red Sneakers', sku: 'SNEAK-RED-42', price: '89.99', description: 'Stylish running sneakers' },
        ],
    },
    {
        id: 'products-with-variants-csv',
        name: 'Products with Variants (CSV)',
        description: 'Import products with multiple variants (sizes, colors) from a CSV file. Handles grouped variants and automatic option creation.',
        category: 'products',
        icon: 'layers',
        difficulty: 'intermediate',
        estimatedTime: '10 minutes',
        requiredFields: ['product_name', 'variant_sku', 'price'],
        optionalFields: ['variant_name', 'color', 'size', 'stock_quantity', 'weight'],
        formats: ['CSV'],
        tags: ['initial-import'],
        sampleData: [
            { product_name: 'T-Shirt', variant_sku: 'TS-BLU-S', variant_name: 'Blue Small', color: 'Blue', size: 'S', price: '29.99', stock_quantity: '50' },
            { product_name: 'T-Shirt', variant_sku: 'TS-BLU-M', variant_name: 'Blue Medium', color: 'Blue', size: 'M', price: '29.99', stock_quantity: '75' },
        ],
    },
    {
        id: 'shopify-products-csv',
        name: 'Shopify Product Export',
        description: 'Import products exported from Shopify in their standard CSV format. Automatically maps Shopify fields to Vendure entities.',
        category: 'products',
        icon: 'shopping-cart',
        difficulty: 'intermediate',
        estimatedTime: '15 minutes',
        requiredFields: ['Title', 'Variant SKU', 'Variant Price'],
        optionalFields: ['Body (HTML)', 'Vendor', 'Tags', 'Variant Inventory Qty', 'Image Src'],
        formats: ['CSV'],
        tags: ['migration', 'shopify'],
        featured: true,
    },
    {
        id: 'woocommerce-products-csv',
        name: 'WooCommerce Product Export',
        description: 'Import products exported from WooCommerce using the standard Product CSV Export. Handles variable products and attributes.',
        category: 'products',
        icon: 'store',
        difficulty: 'intermediate',
        estimatedTime: '15 minutes',
        requiredFields: ['Name', 'SKU', 'Regular price'],
        optionalFields: ['Description', 'Categories', 'Tags', 'Images', 'Stock'],
        formats: ['CSV'],
        tags: ['migration', 'woocommerce'],
        sampleData: [
            { Name: 'Premium Hoodie', SKU: 'HOODIE-001', 'Regular price': '59.99', Description: 'Warm cotton hoodie', Stock: '25' },
        ],
    },
    {
        id: 'price-update-csv',
        name: 'Bulk Price Update (CSV)',
        description: 'Update product prices in bulk by SKU. Perfect for seasonal sales or price adjustments.',
        category: 'products',
        icon: 'dollar-sign',
        difficulty: 'beginner',
        estimatedTime: '3 minutes',
        requiredFields: ['sku', 'price'],
        optionalFields: ['sale_price', 'cost_price'],
        formats: ['CSV'],
        tags: ['bulk-update'],
        sampleData: [
            { sku: 'PROD-001', price: '29.99', sale_price: '24.99' },
            { sku: 'PROD-002', price: '49.99', sale_price: '' },
        ],
    },

    // Customers
    {
        id: 'simple-customers-csv',
        name: 'Simple Customers (CSV)',
        description: 'Import customer records with email, name, and optional phone number. Ideal for building your customer base.',
        category: 'customers',
        icon: 'users',
        difficulty: 'beginner',
        estimatedTime: '5 minutes',
        requiredFields: ['email', 'first_name', 'last_name'],
        optionalFields: ['phone', 'address_line1', 'city', 'postal_code', 'country'],
        formats: ['CSV'],
        tags: ['initial-import'],
        featured: true,
        sampleData: [
            { email: 'john@example.com', first_name: 'John', last_name: 'Doe', phone: '+1234567890' },
            { email: 'jane@example.com', first_name: 'Jane', last_name: 'Smith', phone: '+0987654321' },
        ],
    },
    {
        id: 'customers-with-addresses-csv',
        name: 'Customers with Addresses (CSV)',
        description: 'Import customers with full address information for shipping and billing. Supports multiple addresses per customer.',
        category: 'customers',
        icon: 'map-pin',
        difficulty: 'intermediate',
        estimatedTime: '10 minutes',
        requiredFields: ['email', 'first_name', 'last_name', 'street', 'city', 'postal_code', 'country_code'],
        optionalFields: ['phone', 'company', 'province', 'customer_group'],
        formats: ['CSV'],
        tags: ['initial-import', 'migration'],
        sampleData: [
            { email: 'john@example.com', first_name: 'John', last_name: 'Doe', street: '123 Main St', city: 'New York', postal_code: '10001', country_code: 'US' },
        ],
    },

    // Inventory
    {
        id: 'stock-update-csv',
        name: 'Stock Level Update (CSV)',
        description: 'Update inventory stock levels for existing products by SKU. Supports multiple stock locations.',
        category: 'inventory',
        icon: 'package',
        difficulty: 'beginner',
        estimatedTime: '3 minutes',
        requiredFields: ['sku', 'quantity'],
        optionalFields: ['location', 'reason'],
        formats: ['CSV'],
        tags: ['bulk-update', 'sync'],
        featured: true,
        sampleData: [
            { sku: 'PROD-001', quantity: '100' },
            { sku: 'PROD-002', quantity: '50' },
            { sku: 'PROD-003', quantity: '0' },
        ],
    },
    {
        id: 'multi-location-inventory-csv',
        name: 'Multi-Location Inventory (CSV)',
        description: 'Update stock levels across multiple warehouse locations. Perfect for distributed inventory management.',
        category: 'inventory',
        icon: 'warehouse',
        difficulty: 'intermediate',
        estimatedTime: '5 minutes',
        requiredFields: ['sku', 'location_name', 'quantity'],
        optionalFields: ['allocated', 'incoming', 'safety_stock'],
        formats: ['CSV'],
        tags: ['bulk-update', 'sync'],
        sampleData: [
            { sku: 'PROD-001', location_name: 'Warehouse A', quantity: '100', allocated: '10' },
            { sku: 'PROD-001', location_name: 'Warehouse B', quantity: '50', allocated: '5' },
        ],
    },

    // Catalog
    {
        id: 'collections-csv',
        name: 'Collections/Categories (CSV)',
        description: 'Import product collections and categories with hierarchical structure. Supports nested categories via parent references.',
        category: 'catalog',
        icon: 'folder',
        difficulty: 'beginner',
        estimatedTime: '5 minutes',
        requiredFields: ['name'],
        optionalFields: ['slug', 'description', 'parent_slug', 'position'],
        formats: ['CSV'],
        tags: ['initial-import'],
        featured: true,
        sampleData: [
            { name: 'Electronics', slug: 'electronics', description: 'Electronic devices', parent_slug: '', position: '0' },
            { name: 'Phones', slug: 'phones', description: 'Mobile phones', parent_slug: 'electronics', position: '0' },
        ],
    },
    {
        id: 'facets-csv',
        name: 'Facets/Attributes (CSV)',
        description: 'Import product facets (like Color, Size, Brand) and their values for filtering and product options.',
        category: 'catalog',
        icon: 'tag',
        difficulty: 'beginner',
        estimatedTime: '5 minutes',
        requiredFields: ['facet_name', 'facet_code', 'value_name', 'value_code'],
        optionalFields: [],
        formats: ['CSV'],
        tags: ['initial-import'],
        sampleData: [
            { facet_name: 'Color', facet_code: 'color', value_name: 'Red', value_code: 'red' },
            { facet_name: 'Color', facet_code: 'color', value_name: 'Blue', value_code: 'blue' },
        ],
    },

    // Promotions
    {
        id: 'coupons-csv',
        name: 'Discount Coupons (CSV)',
        description: 'Import coupon codes with discount amounts, validity dates, and usage limits for promotional campaigns.',
        category: 'promotions',
        icon: 'percent',
        difficulty: 'intermediate',
        estimatedTime: '5 minutes',
        requiredFields: ['name', 'coupon_code'],
        optionalFields: ['discount_percentage', 'discount_amount', 'starts_at', 'ends_at', 'usage_limit'],
        formats: ['CSV'],
        tags: ['initial-import', 'bulk-update'],
        featured: true,
        sampleData: [
            { name: 'Summer Sale', coupon_code: 'SUMMER20', discount_percentage: '20', starts_at: '2024-06-01', ends_at: '2024-08-31', usage_limit: '100' },
        ],
    },
];

const CATEGORY_INFO: Record<TemplateCategory, Omit<CategoryInfo, 'count'>> = {
    products: {
        category: 'products',
        label: 'Products',
        description: 'Import and update product data including variants, pricing, and attributes',
        icon: 'shopping-bag',
    },
    customers: {
        category: 'customers',
        label: 'Customers',
        description: 'Import customer records with addresses and group assignments',
        icon: 'users',
    },
    inventory: {
        category: 'inventory',
        label: 'Inventory',
        description: 'Update stock levels and manage inventory across locations',
        icon: 'package',
    },
    orders: {
        category: 'orders',
        label: 'Orders',
        description: 'Import historical orders for data migration',
        icon: 'receipt',
    },
    promotions: {
        category: 'promotions',
        label: 'Promotions',
        description: 'Create discount codes and promotional campaigns',
        icon: 'percent',
    },
    catalog: {
        category: 'catalog',
        label: 'Catalog',
        description: 'Set up collections, facets, and category structures',
        icon: 'folder-tree',
    },
};

export interface UseImportTemplatesResult {
    templates: ImportTemplate[];
    categories: CategoryInfo[];
    featuredTemplates: ImportTemplate[];
    getTemplateById: (id: string) => ImportTemplate | undefined;
    getTemplatesByCategory: (category: TemplateCategory) => ImportTemplate[];
    searchTemplates: (query: string) => ImportTemplate[];
    isLoading: boolean;
}

export function useImportTemplates(): UseImportTemplatesResult {
    // In a production environment, this could fetch templates via GraphQL
    // For now, we use the static templates data

    const templates = React.useMemo(() => {
        // Sort by featured first, then by name
        return [...TEMPLATES].sort((a, b) => {
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;
            return a.name.localeCompare(b.name);
        });
    }, []);

    const categories = React.useMemo(() => {
        const counts = new Map<TemplateCategory, number>();
        for (const template of templates) {
            counts.set(template.category, (counts.get(template.category) || 0) + 1);
        }

        return (['products', 'customers', 'inventory', 'catalog', 'promotions'] as TemplateCategory[])
            .filter(cat => counts.has(cat))
            .map(cat => ({
                ...CATEGORY_INFO[cat],
                count: counts.get(cat) ?? 0,
            }));
    }, [templates]);

    const featuredTemplates = React.useMemo(
        () => templates.filter(t => t.featured),
        [templates],
    );

    const getTemplateById = React.useCallback(
        (id: string) => templates.find(t => t.id === id),
        [templates],
    );

    const getTemplatesByCategory = React.useCallback(
        (category: TemplateCategory) => templates.filter(t => t.category === category),
        [templates],
    );

    const searchTemplates = React.useCallback(
        (query: string) => {
            if (!query.trim()) return templates;
            const normalizedQuery = query.toLowerCase();
            return templates.filter(t =>
                t.name.toLowerCase().includes(normalizedQuery) ||
                t.description.toLowerCase().includes(normalizedQuery) ||
                t.requiredFields.some(f => f.toLowerCase().includes(normalizedQuery)) ||
                t.tags?.some(tag => tag.toLowerCase().includes(normalizedQuery)),
            );
        },
        [templates],
    );

    return {
        templates,
        categories,
        featuredTemplates,
        getTemplateById,
        getTemplatesByCategory,
        searchTemplates,
        isLoading: false,
    };
}
