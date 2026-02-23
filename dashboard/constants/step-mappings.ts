import type { StepType } from '../../shared/types';
import type { VisualNodeCategory } from '../types/pipeline';
import type { LucideIcon } from 'lucide-react';
import type { StepConfig } from './steps';
import { DEFAULT_STEP_CONFIGS } from './steps';
import { resolveIconName } from '../utils/icon-resolver';

export const NODE_CATEGORIES = {
    TRIGGER: 'trigger',
    SOURCE: 'source',
    TRANSFORM: 'transform',
    VALIDATE: 'validate',
    CONDITION: 'condition',
    ENRICH: 'enrich',
    LOAD: 'load',
    EXPORT: 'export',
    FEED: 'feed',
    SINK: 'sink',
    FILTER: 'filter',
    GATE: 'gate',
} as const satisfies Record<string, VisualNodeCategory>;

export const ADAPTER_TYPES = {
    TRIGGER: 'TRIGGER',
    EXTRACTOR: 'EXTRACTOR',
    OPERATOR: 'OPERATOR',
    VALIDATOR: 'VALIDATOR',
    ENRICHER: 'ENRICHER',
    ROUTER: 'ROUTER',
    LOADER: 'LOADER',
    EXPORTER: 'EXPORTER',
    FEED: 'FEED',
    SINK: 'SINK',
} as const;

// ---------------------------------------------------------------------------
// Step mapping result type
// ---------------------------------------------------------------------------

export interface StepMappings {
    stepTypeToCategory: Record<string, VisualNodeCategory>;
    categoryToStepType: Record<string, StepType>;
    categoryToAdapterType: Record<string, string>;
    adapterTypeToNodeType: Record<string, string>;
    adapterTypeToCategory: Record<string, string>;
    categoryColors: Record<VisualNodeCategory, string>;
}

// ---------------------------------------------------------------------------
// Dynamic builder: derives all maps from step config data
// ---------------------------------------------------------------------------

/**
 * Maps backend adapter type to UI category label for adapter catalog grouping.
 * This is the only map not derivable from step configs, so it stays hand-maintained.
 */
const ADAPTER_TYPE_CATEGORY_LABELS: Record<string, string> = {
    EXTRACTOR: 'SOURCES',
    OPERATOR: 'TRANSFORMS',
    VALIDATOR: 'VALIDATION',
    ENRICHER: 'TRANSFORMS',
    ROUTER: 'ROUTING',
    LOADER: 'DESTINATIONS',
    EXPORTER: 'EXPORTS',
    FEED: 'FEEDS',
    SINK: 'SINKS',
};

/**
 * Internal builder used by both the static fallback derivation and the public
 * `buildStepMappings` function.
 *
 * `adapterTypeToCategory` (UI labels like SOURCES, TRANSFORMS) is not derivable from
 * step configs alone, so it must be provided as a parameter.
 */
function buildStepMappingsInternal(
    stepConfigs: Record<string, StepConfig>,
    adapterTypeCategoryLabels: Record<string, string>,
): StepMappings {
    const stepTypeToCategory: Record<string, VisualNodeCategory> = {};
    const categoryToStepType: Record<string, StepType> = {};
    const categoryToAdapterType: Record<string, string> = { filter: 'OPERATOR' };
    const adapterTypeToNodeType: Record<string, string> = {};
    const categoryColors: Record<string, string> = {};

    for (const config of Object.values(stepConfigs)) {
        const stepType = config.type;
        const category = config.nodeType as VisualNodeCategory;

        // stepType -> category
        stepTypeToCategory[stepType] = category;

        // category -> stepType (first wins for shared categories)
        if (!(category in categoryToStepType)) {
            categoryToStepType[category] = stepType;
        }

        // category -> adapterType
        if (config.adapterType) {
            categoryToAdapterType[category] = config.adapterType;
            // adapterType -> nodeType (first wins for shared adapter types like OPERATOR)
            if (!(config.adapterType in adapterTypeToNodeType)) {
                adapterTypeToNodeType[config.adapterType] = category;
            }
        }

        // category -> color
        categoryColors[category] = config.color;
    }

    // filter category shares transform's color
    if (!categoryColors.filter && categoryColors.transform) {
        categoryColors.filter = categoryColors.transform;
    }

    return {
        stepTypeToCategory,
        categoryToStepType,
        categoryToAdapterType,
        adapterTypeToNodeType,
        adapterTypeToCategory: { ...adapterTypeCategoryLabels },
        categoryColors: categoryColors as Record<VisualNodeCategory, string>,
    };
}

/**
 * Builds all step mapping tables from backend step config data.
 *
 * The `adapterType` field on each config drives `categoryToAdapterType` and `adapterTypeToNodeType`.
 * The `nodeType` field (equal to the visual node category) drives `adapterTypeToNodeType`.
 * The `category` field drives `stepTypeToCategory` and `categoryToStepType`.
 */
export function buildStepMappings(stepConfigs: Record<string, StepConfig>): StepMappings {
    return buildStepMappingsInternal(stepConfigs, ADAPTER_TYPE_CATEGORY_LABELS);
}

// ---------------------------------------------------------------------------
// Auto-derived fallback maps from DEFAULT_STEP_CONFIGS
// ---------------------------------------------------------------------------

const _derived = buildStepMappingsInternal(DEFAULT_STEP_CONFIGS, ADAPTER_TYPE_CATEGORY_LABELS);

export const STEP_TYPE_TO_CATEGORY = _derived.stepTypeToCategory;
export const CATEGORY_TO_STEP_TYPE = _derived.categoryToStepType;
export const CATEGORY_TO_ADAPTER_TYPE = _derived.categoryToAdapterType;
export const ADAPTER_TYPE_TO_NODE_TYPE = _derived.adapterTypeToNodeType;
export const ADAPTER_TYPE_TO_CATEGORY = _derived.adapterTypeToCategory;
export const CATEGORY_COLORS = _derived.categoryColors;

/** Static fallback mappings used during loading before backend data arrives. */
export const FALLBACK_STEP_MAPPINGS: StepMappings = _derived;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function mapStepTypeToCategory(stepType: string): VisualNodeCategory {
    const type = String(stepType).toUpperCase();
    return STEP_TYPE_TO_CATEGORY[type] ?? 'transform';
}

export function mapCategoryToStepType(category: string): StepType {
    return CATEGORY_TO_STEP_TYPE[category] ?? 'TRANSFORM';
}

export function getStepTypeIcon(stepType: string): LucideIcon | undefined {
    const type = String(stepType).toUpperCase();
    const config = DEFAULT_STEP_CONFIGS[type as StepType];
    return config ? resolveIconName(config.icon) : undefined;
}
