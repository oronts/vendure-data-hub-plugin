import * as React from 'react';
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
import { useAdapters } from './api/useAdapters';
import { useConnectionCodes } from './api/useConnections';
import { useSecrets } from './api/useSecrets';
import { QUERY_LIMITS, FALLBACK_COLORS, UI_ADAPTER_CATEGORY } from '../constants';
import { ADAPTER_TYPE_TO_NODE_TYPE, ADAPTER_TYPE_TO_CATEGORY } from '../constants/UiStates';

interface CatalogSchemaField {
    key: string;
    label?: string;
    type: string;
    required?: boolean;
    description?: string;
    defaultValue?: unknown;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
}

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
        fields: CatalogSchemaField[];
    };
}

type AdapterNodeType = import('../types').VisualNodeCategory;

interface AdapterCatalog {
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

const TYPE_ICONS: Record<string, LucideIcon> = {
    EXTRACTOR: Download,
    OPERATOR: RefreshCw,
    VALIDATOR: CheckCircle,
    ENRICHER: Sparkles,
    ROUTER: GitBranch,
    LOADER: Upload,
    EXPORTER: FileOutput,
    FEED: Rss,
    SINK: Database,
};

const TYPE_COLORS: Record<string, string> = {
    EXTRACTOR: '#3b82f6',
    OPERATOR: '#8b5cf6',
    VALIDATOR: '#22c55e',
    ENRICHER: '#f59e0b',
    ROUTER: '#f97316',
    LOADER: '#6366f1',
    EXPORTER: '#0ea5e9',
    FEED: '#ec4899',
    SINK: '#64748b',
};

const CODE_ICONS: Record<string, LucideIcon> = {
    'csv': FileText,
    'json': File,
    'xlsx': FileSpreadsheet,
    'xml': Code,
    'rest': Globe,
    'httpApi': Globe,
    'webhook': Webhook,
    'vendureQuery': Box,
    'database': Database,
    'map': RefreshCw,
    'template': Code,
    'when': Filter,
    'filter': Filter,
    'aggregate': Layers,
    'deduplicate': Zap,
    'lookup': Search,
    'httpLookup': Globe,
    'split': GitBranch,
    'coerce': RefreshCw,
    'validateRequired': AlertCircle,
    'validateFormat': CheckCircle,
    'validateRange': Eye,
    'productUpsert': Box,
    'variantUpsert': Package,
    'customerUpsert': Users,
    'orderCreate': ShoppingCart,
    'http': Globe,
    'csvExport': FileText,
    'googleMerchant': ShoppingCart,
    'metaCatalog': Users,
    'rss': Rss,
    'customFeed': Code,
};

const CODE_COLORS: Record<string, string> = {
    'csv': '#3b82f6',
    'json': '#eab308',
    'xlsx': '#22c55e',
    'xml': '#f97316',
    'rest': '#8b5cf6',
    'httpApi': '#8b5cf6',
    'webhook': '#ec4899',
    'vendureQuery': '#6366f1',
    'database': '#0ea5e9',
    'map': '#8b5cf6',
    'template': '#f59e0b',
    'when': '#3b82f6',
    'filter': '#3b82f6',
    'aggregate': '#10b981',
    'deduplicate': '#6366f1',
    'lookup': '#0ea5e9',
    'httpLookup': '#059669',
    'split': '#f97316',
    'coerce': '#84cc16',
    'validateRequired': '#ef4444',
    'validateFormat': '#22c55e',
    'validateRange': '#f59e0b',
    'productUpsert': '#6366f1',
    'variantUpsert': '#14b8a6',
    'customerUpsert': '#10b981',
    'orderCreate': '#f97316',
    'http': '#8b5cf6',
    'csvExport': '#3b82f6',
    'googleMerchant': '#4285f4',
    'metaCatalog': '#1877f2',
    'rss': '#f97316',
    'customFeed': '#8b5cf6',
};

function adapterTypeToNodeType(adapterType: string): AdapterNodeType {
    return (ADAPTER_TYPE_TO_NODE_TYPE[adapterType] ?? 'transform') as AdapterNodeType;
}

function adapterTypeToCategory(adapterType: string): string {
    return ADAPTER_TYPE_TO_CATEGORY[adapterType] ?? 'other';
}

function buildAdapterMetadata(adapter: {
    code: string;
    type: string;
    name?: string | null;
    description?: string | null;
    schema?: {
        fields: Array<{
            key: string;
            label?: string | null;
            type: string;
            required?: boolean | null;
            description?: string | null;
            defaultValue?: unknown;
            placeholder?: string | null;
            options?: Array<{ value: string; label: string }> | null;
        }>;
    };
}): AdapterMetadata {
    const code = adapter.code;
    const type = adapter.type;

    const icon = Object.hasOwn(CODE_ICONS, code) ? CODE_ICONS[code]
               : Object.hasOwn(TYPE_ICONS, type) ? TYPE_ICONS[type]
               : Settings;

    const color = Object.hasOwn(CODE_COLORS, code) ? CODE_COLORS[code]
                : Object.hasOwn(TYPE_COLORS, type) ? TYPE_COLORS[type]
                : FALLBACK_COLORS.UNKNOWN_STEP_COLOR;

    let schema = adapter.schema;
    if (typeof schema === 'string') {
        try {
            schema = JSON.parse(schema);
        } catch {
            schema = { fields: [] };
        }
    }

    const mappedFields: CatalogSchemaField[] = (schema?.fields ?? []).map((f) => ({
        key: f.key,
        label: f.label ?? undefined,
        type: f.type,
        required: f.required ?? undefined,
        description: f.description ?? undefined,
        defaultValue: f.defaultValue ?? undefined,
        placeholder: f.placeholder ?? undefined,
        options: f.options ?? undefined,
    }));

    return {
        code,
        type,
        name: adapter.name ?? code,
        description: adapter.description ?? undefined,
        icon,
        color,
        category: adapterTypeToCategory(type),
        nodeType: adapterTypeToNodeType(type),
        schema: { fields: mappedFields },
    };
}

const CORE_ADAPTERS: AdapterMetadata[] = [
    {
        code: 'condition',
        type: 'ROUTER',
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

interface UseAdapterCatalogResult {
    catalog: AdapterCatalog;
    adapters: AdapterMetadata[];
    connectionCodes: string[];
    secretOptions: Array<{ code: string; provider?: string }>;
    isLoading: boolean;
    error: Error | null;
    getAdapter: (code: string) => AdapterMetadata | undefined;
    getAdaptersByType: (type: string) => AdapterMetadata[];
    getAdaptersByNodeType: (nodeType: AdapterNodeType) => AdapterMetadata[];
}

export function useAdapterCatalog(): UseAdapterCatalogResult {
    const { data: adaptersData, isLoading: adaptersLoading, error: adaptersError } = useAdapters();
    const { data: connectionCodesData } = useConnectionCodes();
    const { data: secretsData } = useSecrets({ take: QUERY_LIMITS.SECRETS_LIST });

    const adapters: AdapterMetadata[] = React.useMemo(() => {
        const rawAdapters = adaptersData ?? [];
        const mapped = rawAdapters.map(buildAdapterMetadata);

        const codes = new Set(mapped.map(a => a.code));
        for (const core of CORE_ADAPTERS) {
            if (!codes.has(core.code)) {
                mapped.push(core);
            }
        }

        return mapped;
    }, [adaptersData]);

    const catalog: AdapterCatalog = React.useMemo(() => {
        const sources = adapters.filter(a => a.category === UI_ADAPTER_CATEGORY.SOURCES);
        const transforms = adapters.filter(a => a.category === UI_ADAPTER_CATEGORY.TRANSFORMS);
        const validation = adapters.filter(a => a.category === UI_ADAPTER_CATEGORY.VALIDATION);
        const routing = adapters.filter(a => a.category === UI_ADAPTER_CATEGORY.ROUTING);
        const destinations = adapters.filter(a => a.category === UI_ADAPTER_CATEGORY.DESTINATIONS);
        const feeds = adapters.filter(a => a.category === UI_ADAPTER_CATEGORY.FEEDS);
        const exports = adapters.filter(a => a.category === UI_ADAPTER_CATEGORY.EXPORTS);
        const sinks = adapters.filter(a => a.category === UI_ADAPTER_CATEGORY.SINKS);

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

    const connectionCodes = React.useMemo(() => {
        return connectionCodesData ?? [];
    }, [connectionCodesData]);

    const secretOptions = React.useMemo(() => {
        return (secretsData?.items ?? []).map(s => ({
            code: s.code,
            provider: s.provider ?? undefined,
        }));
    }, [secretsData]);

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

