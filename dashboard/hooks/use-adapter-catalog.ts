import * as React from 'react';
import {
    GitBranch,
    Settings,
    type LucideIcon,
} from 'lucide-react';
import { useAdapters } from './api/use-adapters';
import { useConnectionCodes } from './api/use-connections';
import { useSecrets } from './api/use-secrets';
import { QUERY_LIMITS, FALLBACK_COLORS, UI_ADAPTER_CATEGORY, ADAPTER_TYPE_TO_NODE_TYPE, ADAPTER_TYPE_TO_CATEGORY } from '../constants';
import { resolveIconName } from '../utils/icon-resolver';

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
    entityType?: string;
    formatType?: string;
    patchableFields?: string[];
    editorType?: string;
    summaryTemplate?: string;
    categoryLabel?: string;
    categoryOrder?: number;
    wizardHidden?: boolean;
    builtIn?: boolean;
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
    icon?: string | null;
    color?: string | null;
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
    entityType?: string | null;
    formatType?: string | null;
    patchableFields?: readonly string[] | null;
    editorType?: string | null;
    summaryTemplate?: string | null;
    categoryLabel?: string | null;
    categoryOrder?: number | null;
    wizardHidden?: boolean | null;
    builtIn?: boolean | null;
}): AdapterMetadata {
    const code = adapter.code;
    const type = adapter.type;

    const icon = resolveIconName(adapter.icon) ?? Settings;
    const color = adapter.color ?? FALLBACK_COLORS.UNKNOWN_STEP_COLOR;

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
        entityType: adapter.entityType ?? undefined,
        formatType: adapter.formatType ?? undefined,
        patchableFields: adapter.patchableFields ? [...adapter.patchableFields] : undefined,
        editorType: adapter.editorType ?? undefined,
        summaryTemplate: adapter.summaryTemplate ?? undefined,
        categoryLabel: adapter.categoryLabel ?? undefined,
        categoryOrder: adapter.categoryOrder ?? undefined,
        wizardHidden: adapter.wizardHidden ?? undefined,
        builtIn: adapter.builtIn ?? undefined,
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
        category: UI_ADAPTER_CATEGORY.ROUTING,
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

