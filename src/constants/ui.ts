export const STEP_ICONS = {
    TRIGGER: 'Play',
    EXTRACT: 'Download',
    TRANSFORM: 'RefreshCw',
    VALIDATE: 'CheckCircle',
    ENRICH: 'Sparkles',
    ROUTE: 'GitBranch',
    LOAD: 'Upload',
    EXPORT: 'FileOutput',
    FEED: 'Rss',
    SINK: 'Database',
} as const;

/**
 * Adapter icons by adapter code (Lucide icon names)
 */
export const ADAPTER_ICONS = {
    // Extractors
    rest: 'Globe',
    csv: 'FileSpreadsheet',
    graphql: 'Braces',
    database: 'Database',
    s3: 'Cloud',
    sftp: 'Server',
    ftp: 'Server',
    file: 'File',

    // Operators
    map: 'ArrowRightLeft',
    enrich: 'Sparkles',
    when: 'Filter',
    template: 'FileText',
    set: 'Edit',
    remove: 'Trash2',
    rename: 'Tag',
    lookup: 'Search',
    currency: 'DollarSign',
    unit: 'Ruler',
    aggregate: 'Calculator',
    deltaFilter: 'GitCompare',
    deduplicate: 'Zap',
    split: 'GitBranch',

    // Loaders
    productUpsert: 'Package',
    variantUpsert: 'Box',
    customerUpsert: 'Users',
    collectionUpsert: 'FolderTree',
    stockAdjust: 'Warehouse',
    orderNote: 'MessageSquare',
    restPost: 'Send',

    // Feeds
    googleShopping: 'ShoppingCart',
    facebookCatalog: 'Users',
    rssFeed: 'Rss',
} as const;

/**
 * Step type colors (hex values)
 */
export const STEP_COLORS = {
    TRIGGER: '#10B981',   // green
    EXTRACT: '#3B82F6',   // blue
    TRANSFORM: '#8B5CF6', // purple
    VALIDATE: '#F59E0B',  // amber
    ENRICH: '#EC4899',    // pink
    ROUTE: '#6366F1',     // indigo
    LOAD: '#14B8A6',      // teal
    EXPORT: '#F97316',    // orange
    FEED: '#F97316',      // orange
    SINK: '#6366F1',      // indigo
} as const;

/**
 * Run status colors
 */
export const STATUS_COLORS = {
    PENDING: '#6B7280',     // gray
    RUNNING: '#3B82F6',     // blue
    COMPLETED: '#10B981',   // green
    FAILED: '#EF4444',      // red
    CANCELLED: '#F59E0B',   // amber
    CANCEL_REQUESTED: '#F59E0B', // amber
} as const;

/**
 * Pipeline status colors
 */
export const PIPELINE_STATUS_COLORS = {
    DRAFT: '#6B7280',       // gray
    REVIEW: '#F59E0B',      // amber
    PUBLISHED: '#10B981',   // green
    ARCHIVED: '#9CA3AF',    // light gray
} as const;

