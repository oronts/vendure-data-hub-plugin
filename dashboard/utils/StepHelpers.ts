import { StepType, ADAPTER_TYPES, CATEGORY_TO_STEP_TYPE, CATEGORY_TO_ADAPTER_TYPE } from '../constants/index';

const STEP_TO_ADAPTER_TYPE: Record<StepType, string | null> = {
    TRIGGER: null,
    EXTRACT: ADAPTER_TYPES.EXTRACTOR,
    TRANSFORM: ADAPTER_TYPES.OPERATOR,
    VALIDATE: ADAPTER_TYPES.VALIDATOR,
    ENRICH: ADAPTER_TYPES.ENRICHER,
    ROUTE: ADAPTER_TYPES.ROUTER,
    LOAD: ADAPTER_TYPES.LOADER,
    EXPORT: ADAPTER_TYPES.EXPORTER,
    FEED: ADAPTER_TYPES.FEED,
    SINK: ADAPTER_TYPES.SINK,
    GATE: null,
};

function getAdapterType(stepType: StepType): string | null {
    return STEP_TO_ADAPTER_TYPE[stepType] ?? null;
}

export function getAdapterTypeLabel(adapterType: string | null): string {
    switch (adapterType) {
        case ADAPTER_TYPES.EXTRACTOR: return 'Data Source';
        case ADAPTER_TYPES.OPERATOR: return 'Transform Operation';
        case ADAPTER_TYPES.LOADER: return 'Destination';
        case ADAPTER_TYPES.ENRICHER: return 'Enrichment';
        case ADAPTER_TYPES.EXPORTER: return 'Export Format';
        case ADAPTER_TYPES.FEED: return 'Feed Type';
        case ADAPTER_TYPES.SINK: return 'Search Engine';
        case ADAPTER_TYPES.VALIDATOR: return 'Validation Rule';
        case ADAPTER_TYPES.ROUTER: return 'Routing Logic';
        default: return 'Adapter';
    }
}

export function normalizeStepType(type: string): StepType {
    if (CATEGORY_TO_STEP_TYPE[type]) {
        return CATEGORY_TO_STEP_TYPE[type] as StepType;
    }
    return type.toUpperCase() as StepType;
}

export function getAdapterTypeForStep(type: string): string | null {
    if (CATEGORY_TO_ADAPTER_TYPE[type]) {
        return CATEGORY_TO_ADAPTER_TYPE[type];
    }
    return getAdapterType(type.toUpperCase() as StepType);
}
