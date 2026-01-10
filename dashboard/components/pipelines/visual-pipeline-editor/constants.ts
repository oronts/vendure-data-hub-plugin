import {
    FileText,
    File,
    FileSpreadsheet,
    Code,
    Globe,
    Webhook,
    Box,
    Package,
    ShoppingCart,
    Users,
    RefreshCw,
    Filter,
    Layers,
    Zap,
    Search,
    GitBranch,
    CheckCircle,
    AlertCircle,
    Eye,
    Rss,
    Facebook,
} from 'lucide-react';

// =============================================================================
// NODE CATALOG - Enhanced with Feed and Export Destinations
// =============================================================================

export const NODE_CATALOG = {
    sources: [
        { type: 'csv', label: 'CSV Import', icon: FileText, color: '#3b82f6', description: 'Upload and parse CSV files', category: 'file' },
        { type: 'json', label: 'JSON Import', icon: File, color: '#eab308', description: 'Upload and parse JSON files', category: 'file' },
        { type: 'excel', label: 'Excel Import', icon: FileSpreadsheet, color: '#22c55e', description: 'Upload and parse Excel files', category: 'file' },
        { type: 'xml', label: 'XML Import', icon: Code, color: '#f97316', description: 'Upload and parse XML files', category: 'file' },
        { type: 'rest', label: 'REST API', icon: Globe, color: '#8b5cf6', description: 'Fetch data from REST API', category: 'api' },
        { type: 'webhook', label: 'Webhook', icon: Webhook, color: '#ec4899', description: 'Receive data via webhook', category: 'api' },
        { type: 'vendure-query', label: 'Vendure Query', icon: Box, color: '#6366f1', description: 'Extract Vendure data', category: 'vendure' },
    ],
    transforms: [
        { type: 'map', label: 'Map Fields', icon: RefreshCw, color: '#8b5cf6', description: 'Rename and map fields' },
        { type: 'template', label: 'Formula', icon: Code, color: '#f59e0b', description: 'Apply calculations' },
        { type: 'when', label: 'Filter', icon: Filter, color: '#3b82f6', description: 'Filter records by condition' },
        { type: 'aggregate', label: 'Aggregate', icon: Layers, color: '#10b981', description: 'Group and aggregate' },
        { type: 'deduplicate', label: 'Deduplicate', icon: Zap, color: '#6366f1', description: 'Remove duplicates' },
        { type: 'lookup', label: 'Lookup', icon: Search, color: '#0ea5e9', description: 'Join with another source' },
        { type: 'split', label: 'Split', icon: GitBranch, color: '#f97316', description: 'Split into multiple rows' },
        { type: 'coerce', label: 'Convert Types', icon: RefreshCw, color: '#84cc16', description: 'Convert data types' },
    ],
    validation: [
        { type: 'validateFormat', label: 'Schema', icon: CheckCircle, color: '#22c55e', description: 'Validate against schema' },
        { type: 'validateRequired', label: 'Required', icon: AlertCircle, color: '#ef4444', description: 'Check required fields' },
        { type: 'validateRange', label: 'Quality', icon: Eye, color: '#f59e0b', description: 'Data quality rules' },
    ],
    routing: [
        { type: 'condition', label: 'Condition', icon: GitBranch, color: '#f97316', description: 'Route by condition' },
    ],
    destinations: [
        { type: 'productUpsert', label: 'Load Products', icon: Box, color: '#6366f1', description: 'Create/update products' },
        { type: 'variantUpsert', label: 'Load Variants', icon: Package, color: '#14b8a6', description: 'Create/update variants' },
        { type: 'customerUpsert', label: 'Load Customers', icon: Users, color: '#10b981', description: 'Create/update customers' },
        { type: 'orderCreate', label: 'Load Orders', icon: ShoppingCart, color: '#f97316', description: 'Create orders' },
    ],
    feeds: [
        { type: 'googleMerchant', label: 'Google Shopping', icon: ShoppingCart, color: '#4285f4', description: 'Google Merchant Center feed' },
        { type: 'metaCatalog', label: 'Facebook Catalog', icon: Facebook, color: '#1877f2', description: 'Facebook/Meta catalog' },
        { type: 'rss', label: 'RSS Feed', icon: Rss, color: '#f97316', description: 'RSS/Atom feed' },
        { type: 'customFeed', label: 'Custom Feed', icon: Code, color: '#8b5cf6', description: 'Custom XML/JSON feed' },
    ],
    exports: [
        { type: 'http', label: 'HTTP API', icon: Globe, color: '#8b5cf6', description: 'POST to HTTP endpoint' },
        { type: 'csvExport', label: 'CSV Export', icon: FileText, color: '#3b82f6', description: 'Export as CSV file' },
    ],
};

export const ALL_ADAPTERS = [
    ...NODE_CATALOG.sources.map(n => ({ ...n, nodeType: 'source' })),
    ...NODE_CATALOG.transforms.map(n => ({ ...n, nodeType: 'transform' })),
    ...NODE_CATALOG.validation.map(n => ({ ...n, nodeType: 'validate' })),
    ...NODE_CATALOG.routing.map(n => ({ ...n, nodeType: 'condition' })),
    ...NODE_CATALOG.destinations.map(n => ({ ...n, nodeType: 'load' })),
    ...NODE_CATALOG.feeds.map(n => ({ ...n, nodeType: 'feed' })),
    ...NODE_CATALOG.exports.map(n => ({ ...n, nodeType: 'export' })),
];
