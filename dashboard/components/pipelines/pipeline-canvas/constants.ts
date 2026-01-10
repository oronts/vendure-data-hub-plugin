import {
    Upload,
    Globe,
    Webhook,
    Box,
    FileDown,
    Database,
    Download,
    Shuffle,
    Code,
    GitBranch,
    GitMerge,
    Table,
    Layers,
    RefreshCw,
    ArrowRight,
    Copy,
    CheckCircle,
    AlertCircle,
    Filter,
    Eye,
    EyeOff,
    FileUp,
} from 'lucide-react';

// =============================================================================
// NODE CATALOG - All available node types
// =============================================================================

export const NODE_CATALOG = {
    sources: [
        { type: 'csv', name: 'CSV Upload', icon: Upload, color: 'bg-blue-500', description: 'Upload and parse CSV files' },
        { type: 'excel', name: 'Excel Upload', icon: Upload, color: 'bg-green-500', description: 'Upload and parse Excel files' },
        { type: 'json', name: 'JSON Upload', icon: Upload, color: 'bg-yellow-500', description: 'Upload and parse JSON files' },
        { type: 'rest', name: 'HTTP API', icon: Globe, color: 'bg-purple-500', description: 'Fetch data from REST API' },
        { type: 'webhook', name: 'Webhook', icon: Webhook, color: 'bg-pink-500', description: 'Receive data via webhook' },
        { type: 'vendure-query', name: 'Vendure Query', icon: Box, color: 'bg-indigo-500', description: 'Extract data from Vendure' },
        { type: 'database', name: 'Database Query', icon: Database, color: 'bg-cyan-500', description: 'Query external database' },
    ],
    transforms: [
        { type: 'map', name: 'Map Fields', icon: Shuffle, color: 'bg-violet-500', description: 'Rename and map fields' },
        { type: 'template', name: 'Formula', icon: Code, color: 'bg-amber-500', description: 'Apply formulas to fields' },
        { type: 'split', name: 'Split Columns', icon: GitBranch, color: 'bg-lime-500', description: 'Split column into multiple' },
        { type: 'merge', name: 'Merge Columns', icon: GitMerge, color: 'bg-emerald-500', description: 'Combine multiple columns' },
        { type: 'lookup', name: 'Lookup', icon: Table, color: 'bg-sky-500', description: 'Join with another dataset' },
        { type: 'aggregate', name: 'Aggregate', icon: Layers, color: 'bg-rose-500', description: 'Group and aggregate data' },
        { type: 'pivot', name: 'Pivot', icon: RefreshCw, color: 'bg-fuchsia-500', description: 'Pivot/unpivot data' },
        { type: 'sort', name: 'Sort', icon: ArrowRight, color: 'bg-slate-500', description: 'Sort records by field' },
        { type: 'deduplicate', name: 'Deduplicate', icon: Copy, color: 'bg-stone-500', description: 'Remove duplicate records' },
    ],
    validation: [
        { type: 'validateFormat', name: 'Schema Validation', icon: CheckCircle, color: 'bg-green-600', description: 'Validate against schema' },
        { type: 'validateRange', name: 'Data Quality', icon: AlertCircle, color: 'bg-yellow-600', description: 'Check data quality rules' },
        { type: 'validateRequired', name: 'Required Fields', icon: AlertCircle, color: 'bg-red-500', description: 'Ensure required fields exist' },
    ],
    filtering: [
        { type: 'when', name: 'Filter Rows', icon: Filter, color: 'bg-blue-600', description: 'Filter records by condition' },
        { type: 'sample', name: 'Sample', icon: Eye, color: 'bg-purple-600', description: 'Take sample of records' },
        { type: 'limit', name: 'Limit', icon: EyeOff, color: 'bg-gray-600', description: 'Limit number of records' },
    ],
    routing: [
        { type: 'condition', name: 'Condition', icon: GitBranch, color: 'bg-orange-600', description: 'Route based on condition' },
        { type: 'merge', name: 'Merge Streams', icon: GitMerge, color: 'bg-teal-600', description: 'Merge multiple data streams' },
    ],
    destinations: [
        { type: 'productUpsert', name: 'Load Products', icon: Box, color: 'bg-indigo-600', description: 'Create/update Vendure products' },
        { type: 'orderCreate', name: 'Load Orders', icon: FileUp, color: 'bg-orange-600', description: 'Create Vendure orders' },
        { type: 'customerUpsert', name: 'Load Customers', icon: Database, color: 'bg-teal-600', description: 'Create/update customers' },
        { type: 'http', name: 'HTTP API', icon: Globe, color: 'bg-purple-600', description: 'Send data to REST API' },
        { type: 'csvExport', name: 'CSV Export', icon: Download, color: 'bg-blue-600', description: 'Export data to CSV file' },
    ],
};

export const ALL_NODE_TYPES = Object.values(NODE_CATALOG).flat();
