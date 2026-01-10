/**
 * Step Helpers - Centralized utilities for pipeline step operations
 */
import { StepType, STEP_CONFIGS } from '../constants/index';

// =====================================================================
// ADAPTER TYPE MAPPING
// =====================================================================

/**
 * Map step types to adapter types
 */
export const STEP_TO_ADAPTER_TYPE: Record<StepType, string | null> = {
    TRIGGER: null,
    EXTRACT: 'extractor',
    TRANSFORM: 'operator',
    VALIDATE: 'validator',
    ENRICH: 'enricher',
    ROUTE: 'router',
    LOAD: 'loader',
    EXPORT: 'exporter',
    FEED: 'feed',
    SINK: 'sink',
};

/**
 * Get the adapter type for a step type
 */
export function getAdapterType(stepType: StepType): string | null {
    return STEP_TO_ADAPTER_TYPE[stepType] ?? null;
}

/**
 * Check if a step type requires an adapter selection
 */
export function stepRequiresAdapter(stepType: StepType): boolean {
    return STEP_TO_ADAPTER_TYPE[stepType] !== null;
}

// =====================================================================
// FILE SOURCE ADAPTERS
// =====================================================================

/**
 * Adapter codes that handle file-based sources (backend codes)
 */
export const FILE_SOURCE_ADAPTERS = [
    'csv',
    'json',
    'xml',
    'excel',
] as const;

/** Type for file source adapter codes */
type FileSourceAdapterCode = typeof FILE_SOURCE_ADAPTERS[number];

export function isFileSourceAdapter(adapterCode?: string | null): boolean {
    if (!adapterCode) return false;
    return (FILE_SOURCE_ADAPTERS as readonly string[]).includes(adapterCode);
}

// =====================================================================
// VENDURE LOADER ADAPTERS
// =====================================================================

/**
 * Adapter codes that load data into Vendure entities
 */
export const VENDURE_LOADER_ADAPTERS = [
    'productUpsert',
    'variantUpsert',
    'customerUpsert',
    'orderNote',
    'stockAdjust',
    'applyCoupon',
    'collectionUpsert',
    'promotionUpsert',
    'assetAttach',
    'orderTransition',
] as const;

/** Type for Vendure loader adapter codes */
type VendureLoaderAdapterCode = typeof VENDURE_LOADER_ADAPTERS[number];

export function isVendureLoaderAdapter(adapterCode?: string | null): boolean {
    if (!adapterCode) return false;
    return (VENDURE_LOADER_ADAPTERS as readonly string[]).includes(adapterCode);
}

/**
 * Get the target Vendure entity for a loader adapter
 */
export function getTargetSchemaEntity(adapterCode?: string | null): string | null {
    if (!adapterCode) return null;
    if (adapterCode.includes('product') && !adapterCode.includes('variant')) return 'Product';
    if (adapterCode.includes('variant')) return 'ProductVariant';
    if (adapterCode.includes('customer')) return 'Customer';
    if (adapterCode.includes('order')) return 'Order';
    if (adapterCode.includes('collection')) return 'Collection';
    return null;
}

// =====================================================================
// FILE FORMATS
// =====================================================================

/**
 * Accepted file formats by adapter type (backend codes)
 */
export const ADAPTER_FILE_FORMATS: Record<string, string[]> = {
    'csv': ['csv'],
    'json': ['json'],
    'excel': ['xlsx', 'xls'],
    'xml': ['xml'],
};

export function getAcceptedFormats(adapterCode?: string | null): string[] {
    if (!adapterCode) return ['csv', 'json', 'xlsx'];
    return ADAPTER_FILE_FORMATS[adapterCode] ?? ['csv', 'json', 'xlsx'];
}

// =====================================================================
// STEP VALIDATION
// =====================================================================

/**
 * Validate step configuration completeness
 */
export interface StepValidationResult {
    isValid: boolean;
    issues: string[];
}

export function validateStepConfig(step: { type: StepType; config?: Record<string, unknown> }): StepValidationResult {
    const issues: string[] = [];

    // Check if adapter is required but missing
    if (stepRequiresAdapter(step.type)) {
        if (!step.config?.adapterCode) {
            const adapterType = getAdapterType(step.type);
            const friendlyName = adapterType === 'extractor' ? 'data source' :
                                 adapterType === 'operator' ? 'transform operation' :
                                 adapterType === 'loader' ? 'destination' :
                                 adapterType === 'exporter' ? 'export format' :
                                 adapterType === 'feed' ? 'feed type' :
                                 adapterType === 'sink' ? 'search engine' : 'adapter';
            issues.push(`Select a ${friendlyName} for this step`);
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
}

// =====================================================================
// STEP DISPLAY HELPERS
// =====================================================================

/**
 * Get a friendly label for adapter type
 */
export function getAdapterTypeLabel(adapterType: string | null): string {
    switch (adapterType) {
        case 'extractor': return 'Data Source';
        case 'operator': return 'Transform Operation';
        case 'loader': return 'Destination';
        case 'enricher': return 'Enrichment';
        case 'exporter': return 'Export Format';
        case 'feed': return 'Feed Type';
        case 'sink': return 'Search Engine';
        case 'validator': return 'Validation Rule';
        case 'router': return 'Routing Logic';
        default: return 'Adapter';
    }
}

/**
 * Get step configuration from STEP_CONFIGS or default
 */
export function getStepConfig(stepType: StepType) {
    return STEP_CONFIGS[stepType] ?? {
        type: stepType,
        label: stepType,
        description: `Configure ${stepType.toLowerCase()} step`,
        icon: 'Settings',
        color: '#666666',
        bgColor: '#f5f5f5',
        borderColor: '#cccccc',
        inputs: 1,
        outputs: 1,
    };
}
