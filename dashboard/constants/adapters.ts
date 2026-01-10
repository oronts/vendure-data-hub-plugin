/**
 * Adapter Constants
 * Adapter category definitions and configurations
 */

// Adapter category constants
export const ADAPTER_CATEGORIES = {
    DATA_SOURCE: 'data-source',
    TRANSFORMATION: 'transformation',
    FILTERING: 'filtering',
    ENRICHMENT: 'enrichment',
    CATALOG: 'catalog',
    CUSTOMERS: 'customers',
    ORDERS: 'orders',
    EXTERNAL: 'external',
} as const;

export type AdapterCategory = typeof ADAPTER_CATEGORIES[keyof typeof ADAPTER_CATEGORIES];

// Adapter category configuration interface
export interface AdapterCategoryConfig {
    readonly category: AdapterCategory;
    readonly label: string;
    readonly description: string;
    readonly icon: string;
}

// Adapter category configuration mapping
export const ADAPTER_CATEGORY_CONFIGS: Record<AdapterCategory, AdapterCategoryConfig> = {
    'data-source': {
        category: 'data-source',
        label: 'Data Sources',
        description: 'Extract data from external systems',
        icon: 'Database',
    },
    'transformation': {
        category: 'transformation',
        label: 'Transformation',
        description: 'Map and transform data fields',
        icon: 'RefreshCw',
    },
    'filtering': {
        category: 'filtering',
        label: 'Filtering',
        description: 'Filter and route records',
        icon: 'Filter',
    },
    'enrichment': {
        category: 'enrichment',
        label: 'Enrichment',
        description: 'Add or enhance data',
        icon: 'Sparkles',
    },
    'catalog': {
        category: 'catalog',
        label: 'Catalog',
        description: 'Products, variants, collections',
        icon: 'Package',
    },
    'customers': {
        category: 'customers',
        label: 'Customers',
        description: 'Customer management',
        icon: 'Users',
    },
    'orders': {
        category: 'orders',
        label: 'Orders',
        description: 'Order processing',
        icon: 'ShoppingCart',
    },
    'external': {
        category: 'external',
        label: 'External',
        description: 'Send data to external systems',
        icon: 'Send',
    },
};
