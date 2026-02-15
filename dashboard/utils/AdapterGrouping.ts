import type { StepType, AdapterListItem } from '../types';

function groupAdaptersByCategory(adapters: AdapterListItem[] = []): Record<string, AdapterListItem[]> {
    return (adapters ?? []).reduce((acc, adapter) => {
        const category = adapter.category || 'other';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(adapter);
        return acc;
    }, {} as Record<string, AdapterListItem[]>);
}

interface FilterOptions {
    stepType?: StepType;
    includeDescription?: boolean;
}

function filterAdapters(
    adapters: AdapterListItem[] = [],
    searchQuery: string,
    options: FilterOptions = {}
): AdapterListItem[] {
    const { stepType, includeDescription = true } = options;
    const query = searchQuery.toLowerCase();
    return (adapters ?? []).filter(adapter => {
        const matchesSearch = !query ||
            (adapter.name?.toLowerCase().includes(query) ?? false) ||
            adapter.code.toLowerCase().includes(query) ||
            (includeDescription && adapter.description?.toLowerCase().includes(query));
        const matchesType = !stepType || adapter.type.toUpperCase() === stepType;
        return matchesSearch && matchesType;
    });
}

export function filterAndGroupAdaptersByCategory(
    adapters: AdapterListItem[],
    searchQuery: string,
    options: FilterOptions = {}
): Record<string, AdapterListItem[]> {
    const filtered = filterAdapters(adapters, searchQuery, options);
    return groupAdaptersByCategory(filtered);
}
