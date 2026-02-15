import { StepType, STEP_CONFIGS, ADAPTER_TYPES, CATEGORY_TO_STEP_TYPE, CATEGORY_TO_ADAPTER_TYPE, FALLBACK_COLORS, FILE_FORMAT } from '../constants/index';

export const STEP_TO_ADAPTER_TYPE: Record<StepType, string | null> = {
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
};

function getAdapterType(stepType: StepType): string | null {
    return STEP_TO_ADAPTER_TYPE[stepType] ?? null;
}

export function stepRequiresAdapter(stepType: StepType): boolean {
    return STEP_TO_ADAPTER_TYPE[stepType] !== null;
}

function isFileSourceAdapter(adapterCode?: string | null): boolean {
    if (!adapterCode) return false;
    const upper = adapterCode.toUpperCase();
    return [FILE_FORMAT.CSV, FILE_FORMAT.JSON, FILE_FORMAT.XML, FILE_FORMAT.XLSX].includes(upper as typeof FILE_FORMAT[keyof typeof FILE_FORMAT]);
}

function isVendureLoaderAdapter(adapterCode?: string | null): boolean {
    if (!adapterCode) return false;
    const vendureLoaders = [
        'productUpsert', 'variantUpsert', 'customerUpsert', 'orderNote',
        'stockAdjust', 'applyCoupon', 'collectionUpsert', 'promotionUpsert',
        'assetAttach', 'orderTransition',
    ];
    return vendureLoaders.includes(adapterCode);
}

function getTargetSchemaEntity(adapterCode?: string | null): string | null {
    if (!adapterCode) return null;
    if (adapterCode.includes('product') && !adapterCode.includes('variant')) return 'Product';
    if (adapterCode.includes('variant')) return 'ProductVariant';
    if (adapterCode.includes('customer')) return 'Customer';
    if (adapterCode.includes('order')) return 'Order';
    if (adapterCode.includes('collection')) return 'Collection';
    return null;
}

/**
 * Simple step validation result with string issues.
 * Note: For wizard form validation with field-specific errors,
 * use StepValidationResult from components/wizards/shared/types.ts
 */
interface SimpleStepValidation {
    isValid: boolean;
    issues: string[];
}

function validateStepConfig(step: { type: StepType; config?: Record<string, unknown> }): SimpleStepValidation {
    const issues: string[] = [];

    if (stepRequiresAdapter(step.type)) {
        if (!step.config?.adapterCode) {
            const adapterType = getAdapterType(step.type);
            const friendlyName = adapterType === ADAPTER_TYPES.EXTRACTOR ? 'data source' :
                                 adapterType === ADAPTER_TYPES.OPERATOR ? 'transform operation' :
                                 adapterType === ADAPTER_TYPES.LOADER ? 'destination' :
                                 adapterType === ADAPTER_TYPES.EXPORTER ? 'export format' :
                                 adapterType === ADAPTER_TYPES.FEED ? 'feed type' :
                                 adapterType === ADAPTER_TYPES.SINK ? 'search engine' : 'adapter';
            issues.push(`Select a ${friendlyName} for this step`);
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
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

export function getStepConfig(stepType: StepType) {
    return STEP_CONFIGS[stepType] ?? {
        type: stepType,
        label: stepType,
        description: `Configure ${stepType.toLowerCase()} step`,
        icon: 'Settings',
        color: FALLBACK_COLORS.UNKNOWN_STEP_COLOR,
        bgColor: FALLBACK_COLORS.UNKNOWN_STEP_BG,
        borderColor: FALLBACK_COLORS.UNKNOWN_STEP_BORDER,
        inputs: 1,
        outputs: 1,
    };
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
