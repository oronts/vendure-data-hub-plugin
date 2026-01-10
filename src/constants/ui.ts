// UI CONSTANTS - Icons, colors, and display configuration

/**
 * Step type icons (Lucide icon names)
 */
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

/**
 * Visual editor node colors by type
 */
export const NODE_COLORS = {
    trigger: '#10B981',
    extract: '#3B82F6',
    transform: '#8B5CF6',
    validate: '#F59E0B',
    enrich: '#EC4899',
    route: '#6366F1',
    condition: '#F97316',
    load: '#6366F1',
    feed: '#F97316',
    export: '#14B8A6',
    sink: '#6366F1',
} as const;

/**
 * Brand colors for third-party integrations
 */
export const BRAND_COLORS = {
    GOOGLE: '#4285F4',
    FACEBOOK: '#1877F2',
    AMAZON: '#FF9900',
    TWITTER: '#1DA1F2',
    LINKEDIN: '#0A66C2',
    SHOPIFY: '#96BF48',
} as const;

/**
 * Generic UI colors
 */
export const UI_COLORS = {
    PRIMARY: '#6366F1',     // indigo
    SECONDARY: '#8B5CF6',   // purple
    SUCCESS: '#10B981',     // green
    WARNING: '#F59E0B',     // amber
    ERROR: '#EF4444',       // red
    INFO: '#3B82F6',        // blue
    MUTED: '#6B7280',       // gray
} as const;

/**
 * Dashboard display characters
 */
export const DISPLAY_CHARS = {
    /** Em dash for null/empty values */
    EM_DASH: '\u2014',
    /** Bullet point */
    BULLET: '\u2022',
    /** Ellipsis */
    ELLIPSIS: '\u2026',
} as const;

/**
 * File size formatting units
 */
export const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Base for file size calculations
 */
export const FILE_SIZE_BASE = 1024;
