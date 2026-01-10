import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '@/gql';
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
    Database,
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
    Download,
    Upload,
    Settings,
    Sparkles,
    FileOutput,
    LucideIcon,
} from 'lucide-react';

// =============================================================================
// GRAPHQL QUERY
// =============================================================================

const adaptersQuery = graphql(`
    query DataHubAdaptersForCatalog {
        dataHubAdapters {
            code
            type
            name
            description
            schema {
                fields {
                    key
                    label
                    type
                    required
                    description
                    options { value label }
                }
            }
        }
    }
`);

const connectionsQuery = graphql(`
    query DataHubConnectionsForCatalog($options: DataHubConnectionListOptions) {
        dataHubConnections(options: $options) { items { id code type } }
    }
`);

const secretsQuery = graphql(`
    query DataHubSecretsForCatalog($options: DataHubSecretListOptions) {
        dataHubSecrets(options: $options) { items { id code provider } }
    }
`);

// =============================================================================
// TYPES
// =============================================================================

export interface AdapterMetadata {
    code: string;
    type: string;
    name: string;
    description?: string;
    icon: LucideIcon;
    color: string;
    category: string;
    nodeType: AdapterNodeType;
    schema?: {
        fields: SchemaField[];
    };
}

export interface SchemaField {
    key: string;
    label?: string;
    type: string;
    required?: boolean;
    description?: string;
    defaultValue?: unknown;
    options?: Array<{ value: string; label: string }>;
}

export type AdapterNodeType = 'source' | 'transform' | 'validate' | 'condition' | 'load' | 'feed' | 'export' | 'sink';

export interface AdapterCatalog {
    sources: AdapterMetadata[];
    transforms: AdapterMetadata[];
    validation: AdapterMetadata[];
    routing: AdapterMetadata[];
    destinations: AdapterMetadata[];
    feeds: AdapterMetadata[];
    exports: AdapterMetadata[];
    sinks: AdapterMetadata[];
    all: AdapterMetadata[];
}

// =============================================================================
// ICON AND COLOR MAPPINGS
// =============================================================================

// Default icons by adapter type
const TYPE_ICONS: Record<string, LucideIcon> = {
    extractor: Download,
    operator: RefreshCw,
    validator: CheckCircle,
    enricher: Sparkles,
    router: GitBranch,
    loader: Upload,
    exporter: FileOutput,
    feed: Rss,
    sink: Database,
};

// Default colors by adapter type
const TYPE_COLORS: Record<string, string> = {
    extractor: '#3b82f6',
    operator: '#8b5cf6',
    validator: '#22c55e',
    enricher: '#f59e0b',
    router: '#f97316',
    loader: '#6366f1',
    exporter: '#0ea5e9',
    feed: '#ec4899',
    sink: '#64748b',
};

// Specific icon overrides by adapter code (using backend codes)
const CODE_ICONS: Record<string, LucideIcon> = {
    // Extractors
    'csv': FileText,
    'json': File,
    'excel': FileSpreadsheet,
    'xml': Code,
    'rest': Globe,
    'webhook': Webhook,
    'vendure-query': Box,
    'database': Database,
    // Operators
    'map': RefreshCw,
    'template': Code,
    'when': Filter,
    'filter': Filter,
    'aggregate': Layers,
    'deduplicate': Zap,
    'lookup': Search,
    'split': GitBranch,
    'coerce': RefreshCw,
    // Validators
    'validateRequired': AlertCircle,
    'validateFormat': CheckCircle,
    'validateRange': Eye,
    // Loaders
    'productUpsert': Box,
    'variantUpsert': Package,
    'customerUpsert': Users,
    'orderCreate': ShoppingCart,
    // Exporters
    'http': Globe,
    'csvExport': FileText,
    // Feeds
    'googleMerchant': ShoppingCart,
    'metaCatalog': Users,
    'rss': Rss,
    'customFeed': Code,
};

// Specific color overrides by adapter code (using backend codes)
const CODE_COLORS: Record<string, string> = {
    // Extractors
    'csv': '#3b82f6',
    'json': '#eab308',
    'excel': '#22c55e',
    'xml': '#f97316',
    'rest': '#8b5cf6',
    'webhook': '#ec4899',
    'vendure-query': '#6366f1',
    'database': '#0ea5e9',
    // Operators
    'map': '#8b5cf6',
    'template': '#f59e0b',
    'when': '#3b82f6',
    'filter': '#3b82f6',
    'aggregate': '#10b981',
    'deduplicate': '#6366f1',
    'lookup': '#0ea5e9',
    'split': '#f97316',
    'coerce': '#84cc16',
    // Validators
    'validateRequired': '#ef4444',
    'validateFormat': '#22c55e',
    'validateRange': '#f59e0b',
    // Loaders
    'productUpsert': '#6366f1',
    'variantUpsert': '#14b8a6',
    'customerUpsert': '#10b981',
    'orderCreate': '#f97316',
    // Exporters
    'http': '#8b5cf6',
    'csvExport': '#3b82f6',
    // Feeds
    'googleMerchant': '#4285f4',
    'metaCatalog': '#1877f2',
    'rss': '#f97316',
    'customFeed': '#8b5cf6',
};

// =============================================================================
// ADAPTER TYPE TO NODE TYPE MAPPING
// =============================================================================

function adapterTypeToNodeType(adapterType: string): AdapterNodeType {
    switch (adapterType) {
        case 'extractor': return 'source';
        case 'operator': return 'transform';
        case 'validator': return 'validate';
        case 'enricher': return 'transform'; // Enrichers are treated like transforms
        case 'router': return 'condition';
        case 'loader': return 'load';
        case 'exporter': return 'export';
        case 'feed': return 'feed';
        case 'sink': return 'sink';
        default: return 'transform';
    }
}

function adapterTypeToCategory(adapterType: string): string {
    switch (adapterType) {
        case 'extractor': return 'sources';
        case 'operator': return 'transforms';
        case 'validator': return 'validation';
        case 'enricher': return 'transforms';
        case 'router': return 'routing';
        case 'loader': return 'destinations';
        case 'exporter': return 'exports';
        case 'feed': return 'feeds';
        case 'sink': return 'sinks';
        default: return 'transforms';
    }
}

// =============================================================================
// ADAPTER METADATA BUILDER
// =============================================================================

function buildAdapterMetadata(adapter: {
    code: string;
    type: string;
    name?: string | null;
    description?: string | null;
    schema?: any;
}): AdapterMetadata {
    const code = adapter.code;
    const type = adapter.type;

    // Get icon (code-specific > type-specific > default)
    // Use Object.hasOwn to avoid prototype pollution (e.g., 'toString' is a built-in method)
    const icon = Object.hasOwn(CODE_ICONS, code) ? CODE_ICONS[code]
               : Object.hasOwn(TYPE_ICONS, type) ? TYPE_ICONS[type]
               : Settings;

    // Get color (code-specific > type-specific > default)
    // Use Object.hasOwn to avoid prototype pollution
    const color = Object.hasOwn(CODE_COLORS, code) ? CODE_COLORS[code]
                : Object.hasOwn(TYPE_COLORS, type) ? TYPE_COLORS[type]
                : '#666666';

    // Parse schema if needed
    let schema = adapter.schema;
    if (typeof schema === 'string') {
        try {
            schema = JSON.parse(schema);
        } catch {
            schema = { fields: [] };
        }
    }

    return {
        code,
        type,
        name: adapter.name ?? code,
        description: adapter.description ?? undefined,
        icon,
        color,
        category: adapterTypeToCategory(type),
        nodeType: adapterTypeToNodeType(type),
        schema: schema ? {
            fields: schema.fields ?? [],
        } : { fields: [] },
    };
}

// =============================================================================
// CORE ROUTING ADAPTER
// =============================================================================

const CORE_ADAPTERS: AdapterMetadata[] = [
    {
        code: 'condition',
        type: 'router',
        name: 'Condition',
        description: 'Route records based on conditions',
        icon: GitBranch,
        color: '#f97316',
        category: 'routing',
        nodeType: 'condition',
        schema: {
            fields: [
                { key: 'expression', label: 'Condition Expression', type: 'text', required: true, description: 'JavaScript expression to evaluate (e.g., price > 100)' },
            ],
        },
    },
];

// =============================================================================
// HOOK
// =============================================================================

export interface UseAdapterCatalogResult {
    catalog: AdapterCatalog;
    adapters: AdapterMetadata[];
    connectionCodes: string[];
    secretOptions: Array<{ code: string; provider?: string }>;
    isLoading: boolean;
    error: Error | null;

    // Helper functions
    getAdapter: (code: string) => AdapterMetadata | undefined;
    getAdaptersByType: (type: string) => AdapterMetadata[];
    getAdaptersByNodeType: (nodeType: AdapterNodeType) => AdapterMetadata[];
}

export function useAdapterCatalog(): UseAdapterCatalogResult {
    // Fetch adapters from GraphQL
    const { data: adaptersData, isLoading: adaptersLoading, error: adaptersError } = useQuery({
        queryKey: ['DataHubAdaptersForCatalog'],
        queryFn: () => api.query(adaptersQuery, {}),
        staleTime: 60_000, // Cache for 1 minute
    });

    // Fetch connections
    const { data: connectionsData } = useQuery({
        queryKey: ['DataHubConnectionsForCatalog'],
        queryFn: () => api.query(connectionsQuery, { options: { take: 200 } }),
        staleTime: 60_000,
    });

    // Fetch secrets
    const { data: secretsData } = useQuery({
        queryKey: ['DataHubSecretsForCatalog'],
        queryFn: () => api.query(secretsQuery, { options: { take: 200 } }),
        staleTime: 60_000,
    });

    // Build adapter metadata list
    const adapters: AdapterMetadata[] = React.useMemo(() => {
        const rawAdapters = adaptersData?.dataHubAdapters ?? [];
        const mapped = rawAdapters.map(buildAdapterMetadata);

        // Add core adapters that might not be in registry
        const codes = new Set(mapped.map(a => a.code));
        for (const core of CORE_ADAPTERS) {
            if (!codes.has(core.code)) {
                mapped.push(core);
            }
        }

        return mapped;
    }, [adaptersData]);

    // Build catalog organized by category
    const catalog: AdapterCatalog = React.useMemo(() => {
        const sources = adapters.filter(a => a.category === 'sources');
        const transforms = adapters.filter(a => a.category === 'transforms');
        const validation = adapters.filter(a => a.category === 'validation');
        const routing = adapters.filter(a => a.category === 'routing');
        const destinations = adapters.filter(a => a.category === 'destinations');
        const feeds = adapters.filter(a => a.category === 'feeds');
        const exports = adapters.filter(a => a.category === 'exports');
        const sinks = adapters.filter(a => a.category === 'sinks');

        return {
            sources,
            transforms,
            validation,
            routing,
            destinations,
            feeds,
            exports,
            sinks,
            all: adapters,
        };
    }, [adapters]);

    // Connection codes
    const connectionCodes = React.useMemo(() => {
        return (connectionsData?.dataHubConnections?.items ?? []).map((c: any) => c.code);
    }, [connectionsData]);

    // Secret options
    const secretOptions = React.useMemo(() => {
        return (secretsData?.dataHubSecrets?.items ?? []).map((s: any) => ({
            code: s.code,
            provider: s.provider ?? undefined,
        }));
    }, [secretsData]);

    // Helper functions
    const getAdapter = React.useCallback((code: string) => {
        return adapters.find(a => a.code === code);
    }, [adapters]);

    const getAdaptersByType = React.useCallback((type: string) => {
        return adapters.filter(a => a.type === type);
    }, [adapters]);

    const getAdaptersByNodeType = React.useCallback((nodeType: AdapterNodeType) => {
        return adapters.filter(a => a.nodeType === nodeType);
    }, [adapters]);

    return {
        catalog,
        adapters,
        connectionCodes,
        secretOptions,
        isLoading: adaptersLoading,
        error: adaptersError as Error | null,
        getAdapter,
        getAdaptersByType,
        getAdaptersByNodeType,
    };
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export { TYPE_ICONS, TYPE_COLORS, CODE_ICONS, CODE_COLORS };
export { buildAdapterMetadata, adapterTypeToNodeType, adapterTypeToCategory };
