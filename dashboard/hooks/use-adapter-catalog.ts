import * as React from 'react';
import {
    Settings,
    type LucideIcon,
} from 'lucide-react';
import { useAdapters } from './api/use-adapters';
import { FALLBACK_COLORS, UI_ADAPTER_CATEGORY, ADAPTER_TYPE_TO_NODE_TYPE, ADAPTER_TYPE_TO_CATEGORY } from '../constants';
import { mapAdapterSchema } from '../utils/adapter-schema';
import { resolveIconName } from '../utils/icon-resolver';
import type { AdapterSchema } from '../../shared/types';
import { useDynamicMetadataTranslations } from './use-dynamic-metadata-translations';

export interface AdapterMetadata {
    code: string;
    type: string;
    name: string;
    description?: string;
    icon: LucideIcon;
    color: string;
    category: string;
    nodeType: AdapterNodeType;
    schema: AdapterSchema;
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
    schema?: unknown;
    entityType?: string | null;
    formatType?: string | null;
    patchableFields?: readonly string[] | null;
    editorType?: string | null;
    summaryTemplate?: string | null;
    categoryLabel?: string | null;
    categoryOrder?: number | null;
    wizardHidden?: boolean | null;
    builtIn?: boolean | null;
}, translateAdapter: ReturnType<typeof useDynamicMetadataTranslations>['translateAdapter']): AdapterMetadata {
    const code = adapter.code;
    const type = adapter.type;
    const builtIn = adapter.builtIn === true;
    const fallbackName = adapter.name ?? code;
    const fallbackDescription = adapter.description ?? '';

    const icon = resolveIconName(adapter.icon) ?? Settings;
    const color = adapter.color ?? FALLBACK_COLORS.UNKNOWN_STEP_COLOR;

    return {
        code,
        type,
        name: translateAdapter(type, code, 'name', fallbackName, builtIn),
        description: translateAdapter(
            type,
            code,
            'description',
            fallbackDescription,
            builtIn,
        ) || undefined,
        icon,
        color,
        category: adapterTypeToCategory(type),
        nodeType: adapterTypeToNodeType(type),
        schema: mapAdapterSchema(adapter.schema),
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

interface UseAdapterCatalogResult {
    catalog: AdapterCatalog;
    adapters: AdapterMetadata[];
    isLoading: boolean;
    error: Error | null;
    getAdapter: (code: string) => AdapterMetadata | undefined;
    getAdaptersByType: (type: string) => AdapterMetadata[];
    getAdaptersByNodeType: (nodeType: AdapterNodeType) => AdapterMetadata[];
}

export function useAdapterCatalog(): UseAdapterCatalogResult {
    const { data: adaptersData, isLoading: adaptersLoading, error: adaptersError } = useAdapters();
    const { translateAdapter } = useDynamicMetadataTranslations();

    const adapters: AdapterMetadata[] = React.useMemo(
        () => (adaptersData ?? []).map(adapter => buildAdapterMetadata(adapter, translateAdapter)),
        [adaptersData, translateAdapter],
    );

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
        isLoading: adaptersLoading,
        error: adaptersError as Error | null,
        getAdapter,
        getAdaptersByType,
        getAdaptersByNodeType,
    };
}
