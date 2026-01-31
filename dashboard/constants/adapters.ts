/**
 * Prefixes for built-in adapters.
 * Used to identify adapters that ship with DataHub vs custom adapters.
 */
export const BUILT_IN_ADAPTER_PREFIXES = [
    'vendure-',
    'csv-',
    'json-',
    'http-',
    'file-',
    'filter-',
    'map-',
    'validate-',
] as const;

/**
 * Adapter category constants for UI organization.
 * Values use kebab-case to match backend AdapterCategory enum in src/constants/enums.ts.
 */
export const ADAPTER_CATEGORIES = {
    DATA_SOURCE: 'data-source',
    TRANSFORMATION: 'transformation',
    FILTERING: 'filtering',
    ENRICHMENT: 'enrichment',
    AGGREGATION: 'aggregation',
    CONVERSION: 'conversion',
    CATALOG: 'catalog',
    CUSTOMERS: 'customers',
    ORDERS: 'orders',
    INVENTORY: 'inventory',
    PROMOTIONS: 'promotions',
    ASSETS: 'assets',
    EXTERNAL: 'external',
    UTILITY: 'utility',
} as const;

export type UIAdapterCategory = typeof ADAPTER_CATEGORIES[keyof typeof ADAPTER_CATEGORIES];

export interface UIAdapterCategoryConfig {
    readonly category: UIAdapterCategory;
    readonly label: string;
    readonly description: string;
    readonly icon: string;
}

/**
 * Configuration for each adapter category including display labels, descriptions, and icons.
 * Used by adapter list views and category filters.
 */
export const ADAPTER_CATEGORY_CONFIGS: Record<UIAdapterCategory, UIAdapterCategoryConfig> = {
    [ADAPTER_CATEGORIES.DATA_SOURCE]: {
        category: ADAPTER_CATEGORIES.DATA_SOURCE,
        label: 'Data Sources',
        description: 'Extract data from external systems',
        icon: 'Database',
    },
    [ADAPTER_CATEGORIES.TRANSFORMATION]: {
        category: ADAPTER_CATEGORIES.TRANSFORMATION,
        label: 'Transformation',
        description: 'Map and transform data fields',
        icon: 'RefreshCw',
    },
    [ADAPTER_CATEGORIES.FILTERING]: {
        category: ADAPTER_CATEGORIES.FILTERING,
        label: 'Filtering',
        description: 'Filter and route records',
        icon: 'Filter',
    },
    [ADAPTER_CATEGORIES.ENRICHMENT]: {
        category: ADAPTER_CATEGORIES.ENRICHMENT,
        label: 'Enrichment',
        description: 'Add or enhance data',
        icon: 'Sparkles',
    },
    [ADAPTER_CATEGORIES.AGGREGATION]: {
        category: ADAPTER_CATEGORIES.AGGREGATION,
        label: 'Aggregation',
        description: 'Group and aggregate records',
        icon: 'Layers',
    },
    [ADAPTER_CATEGORIES.CONVERSION]: {
        category: ADAPTER_CATEGORIES.CONVERSION,
        label: 'Conversion',
        description: 'Convert units, currency, dates',
        icon: 'ArrowLeftRight',
    },
    [ADAPTER_CATEGORIES.CATALOG]: {
        category: ADAPTER_CATEGORIES.CATALOG,
        label: 'Catalog',
        description: 'Products, variants, collections',
        icon: 'Package',
    },
    [ADAPTER_CATEGORIES.CUSTOMERS]: {
        category: ADAPTER_CATEGORIES.CUSTOMERS,
        label: 'Customers',
        description: 'Customer management',
        icon: 'Users',
    },
    [ADAPTER_CATEGORIES.ORDERS]: {
        category: ADAPTER_CATEGORIES.ORDERS,
        label: 'Orders',
        description: 'Order processing',
        icon: 'ShoppingCart',
    },
    [ADAPTER_CATEGORIES.INVENTORY]: {
        category: ADAPTER_CATEGORIES.INVENTORY,
        label: 'Inventory',
        description: 'Stock and inventory management',
        icon: 'Warehouse',
    },
    [ADAPTER_CATEGORIES.PROMOTIONS]: {
        category: ADAPTER_CATEGORIES.PROMOTIONS,
        label: 'Promotions',
        description: 'Discounts and promotions',
        icon: 'Percent',
    },
    [ADAPTER_CATEGORIES.ASSETS]: {
        category: ADAPTER_CATEGORIES.ASSETS,
        label: 'Assets',
        description: 'Images and digital assets',
        icon: 'Image',
    },
    [ADAPTER_CATEGORIES.EXTERNAL]: {
        category: ADAPTER_CATEGORIES.EXTERNAL,
        label: 'External',
        description: 'Send data to external systems',
        icon: 'Send',
    },
    [ADAPTER_CATEGORIES.UTILITY]: {
        category: ADAPTER_CATEGORIES.UTILITY,
        label: 'Utility',
        description: 'Helper and utility operations',
        icon: 'Wrench',
    },
};

/**
 * Get the configuration for an adapter category.
 * Returns undefined if the category is not found.
 */
export function getAdapterCategoryConfig(category: string): UIAdapterCategoryConfig | undefined {
    return ADAPTER_CATEGORY_CONFIGS[category as UIAdapterCategory];
}
