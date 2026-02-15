import type { StepType, DataHubAdapter } from '../types';

function groupAdaptersByCategory(adapters: DataHubAdapter[] = []): Record<string, DataHubAdapter[]> {
    return (adapters ?? []).reduce((acc, adapter) => {
        const category = adapter.category || 'other';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(adapter);
        return acc;
    }, {} as Record<string, DataHubAdapter[]>);
}

interface FilterOptions {
    stepType?: StepType;
    includeDescription?: boolean;
}

function filterAdapters(
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

export function filterAndGroupAdaptersByCategory(
    adapters: DataHubAdapter[],
    searchQuery: string,
    options: FilterOptions = {}
): Record<string, DataHubAdapter[]> {
    const filtered = filterAdapters(adapters, searchQuery, options);
    return groupAdaptersByCategory(filtered);
}
