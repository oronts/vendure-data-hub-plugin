import type { StepType, DataHubAdapter } from '../types';

export function groupAdaptersByType(adapters: DataHubAdapter[] = []): Record<StepType, DataHubAdapter[]> {
    return (adapters ?? []).reduce((acc, adapter) => {
        const type = adapter.type.toUpperCase() as StepType;
        if (!acc[type]) {
            acc[type] = [];
        }
        acc[type].push(adapter);
        return acc;
    }, {} as Record<StepType, DataHubAdapter[]>);
}

export function groupAdaptersByCategory(adapters: DataHubAdapter[] = []): Record<string, DataHubAdapter[]> {
    return (adapters ?? []).reduce((acc, adapter) => {
        const category = adapter.category || 'other';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(adapter);
        return acc;
    }, {} as Record<string, DataHubAdapter[]>);
}

export interface FilterOptions {
    stepType?: StepType;
    includeDescription?: boolean;
}

export function filterAdapters(
    adapters: DataHubAdapter[] = [],
    searchQuery: string,
    options: FilterOptions = {}
): DataHubAdapter[] {
    const { stepType, includeDescription = true } = options;
    const query = searchQuery.toLowerCase();
    return (adapters ?? []).filter(adapter => {
        const matchesSearch = !query ||
            adapter.name.toLowerCase().includes(query) ||
            adapter.code.toLowerCase().includes(query) ||
            (includeDescription && adapter.description?.toLowerCase().includes(query));
        const matchesType = !stepType || adapter.type.toUpperCase() === stepType;
        return matchesSearch && matchesType;
    });
}

export function filterAndGroupAdaptersByType(
    adapters: DataHubAdapter[],
    searchQuery: string,
    options: FilterOptions = {}
): Record<StepType, DataHubAdapter[]> {
    const filtered = filterAdapters(adapters, searchQuery, { ...options, includeDescription: false });
    return groupAdaptersByType(filtered);
}

export function filterAndGroupAdaptersByCategory(
    adapters: DataHubAdapter[],
    searchQuery: string,
    options: FilterOptions = {}
): Record<string, DataHubAdapter[]> {
    const filtered = filterAdapters(adapters, searchQuery, options);
    return groupAdaptersByCategory(filtered);
}
