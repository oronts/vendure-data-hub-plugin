/**
 * Visual Pipeline Editor Constants
 * Node catalog and configuration constants
 */

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
    Facebook,
    Rss,
} from 'lucide-react';
import type { NodeCatalogItem, NodeCatalogItemWithNodeType } from './types';

// =============================================================================
// NODE CATALOG
// =============================================================================

export const NODE_CATALOG: Record<string, NodeCatalogItem[]> = {
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

// =============================================================================
// ALL ADAPTERS COMBINED
// =============================================================================

export const ALL_ADAPTERS: NodeCatalogItemWithNodeType[] = [
    ...NODE_CATALOG.sources.map(n => ({ ...n, nodeType: 'source' as const })),
    ...NODE_CATALOG.transforms.map(n => ({ ...n, nodeType: 'transform' as const })),
    ...NODE_CATALOG.validation.map(n => ({ ...n, nodeType: 'validate' as const })),
    ...NODE_CATALOG.routing.map(n => ({ ...n, nodeType: 'condition' as const })),
    ...NODE_CATALOG.destinations.map(n => ({ ...n, nodeType: 'load' as const })),
    ...NODE_CATALOG.feeds.map(n => ({ ...n, nodeType: 'feed' as const })),
    ...NODE_CATALOG.exports.map(n => ({ ...n, nodeType: 'export' as const })),
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getAdapterInfo(adapterCode?: string): NodeCatalogItemWithNodeType | undefined {
    return ALL_ADAPTERS.find(a => a.type === adapterCode);
}

// =============================================================================
// DEFAULT EDGE OPTIONS
// =============================================================================

export const DEFAULT_EDGE_STYLE = {
    strokeWidth: 2,
    stroke: '#94a3b8',
};

// =============================================================================
// FILE SOURCE ADAPTER CODES
// =============================================================================

export const FILE_SOURCE_ADAPTERS = [
    'csv',
    'json',
    'excel',
    'xml',
];

// =============================================================================
// VENDURE LOADER ADAPTER CODES
// =============================================================================

export { VENDURE_LOADER_ADAPTERS } from '../../../utils/step-helpers';

// =============================================================================
// NODE TYPE TO DEFAULT COLOR MAPPING
// =============================================================================

export const NODE_TYPE_COLORS: Record<string, string> = {
    source: '#3b82f6',
    transform: '#8b5cf6',
    validate: '#22c55e',
    condition: '#f97316',
    load: '#6366f1',
    feed: '#f97316',
    export: '#0ea5e9',
    filter: '#8b5cf6',
};
