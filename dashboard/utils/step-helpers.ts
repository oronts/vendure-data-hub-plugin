import {
    ADAPTER_TYPES,
    CATEGORY_TO_ADAPTER_TYPE,
    CATEGORY_TO_STEP_TYPE,
    STEP_TYPE_TO_CATEGORY,
    mapStepTypeToCategory,
} from '../constants/index';
import type { StepType } from '../types';

const ADAPTER_TYPE_LABELS: Record<string, string> = {
    [ADAPTER_TYPES.EXTRACTOR]: 'Data Source',
    [ADAPTER_TYPES.OPERATOR]: 'Transform Operation',
    [ADAPTER_TYPES.LOADER]: 'Destination',
    [ADAPTER_TYPES.ENRICHER]: 'Enrichment',
    [ADAPTER_TYPES.EXPORTER]: 'Export Format',
    [ADAPTER_TYPES.FEED]: 'Feed Type',
    [ADAPTER_TYPES.SINK]: 'Search Engine',
    [ADAPTER_TYPES.VALIDATOR]: 'Validation Rule',
    [ADAPTER_TYPES.ROUTER]: 'Routing Logic',
};

export function getAdapterTypeLabel(adapterType: string | null): string {
    return (adapterType && ADAPTER_TYPE_LABELS[adapterType]) ?? 'Adapter';
}

export function normalizeStepType(type: string): StepType {
    if (CATEGORY_TO_STEP_TYPE[type]) {
        return CATEGORY_TO_STEP_TYPE[type] as StepType;
    }
    const normalized = type.toUpperCase();
    if (!STEP_TYPE_TO_CATEGORY[normalized]) {
        throw new Error(`Unsupported pipeline step type "${type}"`);
    }
    return normalized as StepType;
}

export function getAdapterTypeForStep(type: string): string | null {
    if (CATEGORY_TO_ADAPTER_TYPE[type]) {
        return CATEGORY_TO_ADAPTER_TYPE[type];
    }
    const category = mapStepTypeToCategory(type);
    return CATEGORY_TO_ADAPTER_TYPE[category] ?? null;
}
