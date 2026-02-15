import type { StepType } from '../../shared/types';
import type { VisualNodeCategory } from '../types/Pipeline';
import type { LucideIcon } from 'lucide-react';
import {
    Play,
    Download,
    ArrowRightLeft,
    CheckCircle,
    Sparkles,
    GitBranch,
    Database,
    Upload,
    Rss,
    Search,
} from 'lucide-react';

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

export const STEP_TYPE_TO_CATEGORY: Record<string, VisualNodeCategory> = {
    TRIGGER: 'trigger',
    EXTRACT: 'source',
    TRANSFORM: 'transform',
    VALIDATE: 'validate',
    ENRICH: 'enrich',
    ROUTE: 'condition',
    LOAD: 'load',
    EXPORT: 'export',
    FEED: 'feed',
    SINK: 'sink',
};

export const CATEGORY_TO_STEP_TYPE: Record<string, StepType> = {
    trigger: 'TRIGGER',
    source: 'EXTRACT',
    transform: 'TRANSFORM',
    validate: 'VALIDATE',
    enrich: 'ENRICH',
    condition: 'ROUTE',
    load: 'LOAD',
    export: 'EXPORT',
    feed: 'FEED',
    sink: 'SINK',
};

export const CATEGORY_TO_ADAPTER_TYPE: Record<string, string> = {
    trigger: 'TRIGGER',
    source: 'EXTRACTOR',
    transform: 'OPERATOR',
    validate: 'VALIDATOR',
    enrich: 'ENRICHER',
    condition: 'ROUTER',
    load: 'LOADER',
    export: 'EXPORTER',
    feed: 'FEED',
    sink: 'SINK',
    filter: 'OPERATOR',
};

/**
 * Canonical color for each step type. Shared between:
 * - STEP_CONFIGS (simple editor step list)
 * - CATEGORY_COLORS (workflow editor node palette/nodes)
 * - visual-node-config (ReactFlow node rendering)
 *
 * Change here to update all editors consistently.
 */
export const STEP_TYPE_CANONICAL_COLORS: Record<string, string> = {
    TRIGGER: '#6366f1',
    EXTRACT: '#3b82f6',
    TRANSFORM: '#8b5cf6',
    VALIDATE: '#f59e0b',
    ENRICH: '#10b981',
    ROUTE: '#f97316',
    LOAD: '#ef4444',
    EXPORT: '#ec4899',
    FEED: '#06b6d4',
    SINK: '#84cc16',
};

/** Category colors derived from canonical step type colors for consistency. */
export const CATEGORY_COLORS: Record<VisualNodeCategory, string> = {
    trigger: STEP_TYPE_CANONICAL_COLORS.TRIGGER,
    source: STEP_TYPE_CANONICAL_COLORS.EXTRACT,
    transform: STEP_TYPE_CANONICAL_COLORS.TRANSFORM,
    validate: STEP_TYPE_CANONICAL_COLORS.VALIDATE,
    enrich: STEP_TYPE_CANONICAL_COLORS.ENRICH,
    condition: STEP_TYPE_CANONICAL_COLORS.ROUTE,
    load: STEP_TYPE_CANONICAL_COLORS.LOAD,
    export: STEP_TYPE_CANONICAL_COLORS.EXPORT,
    feed: STEP_TYPE_CANONICAL_COLORS.FEED,
    sink: STEP_TYPE_CANONICAL_COLORS.SINK,
    filter: STEP_TYPE_CANONICAL_COLORS.TRANSFORM,
};

export function mapStepTypeToCategory(stepType: string): VisualNodeCategory {
    const type = String(stepType).toUpperCase();
    return STEP_TYPE_TO_CATEGORY[type] ?? 'transform';
}

export function mapCategoryToStepType(category: string): StepType {
    return CATEGORY_TO_STEP_TYPE[category] ?? 'TRANSFORM';
}

const STEP_TYPE_ICONS: Record<string, LucideIcon> = {
    TRIGGER: Play,
    EXTRACT: Download,
    TRANSFORM: ArrowRightLeft,
    VALIDATE: CheckCircle,
    ENRICH: Sparkles,
    ROUTE: GitBranch,
    LOAD: Database,
    EXPORT: Upload,
    FEED: Rss,
    SINK: Search,
};

export function getStepTypeIcon(stepType: string): LucideIcon | undefined {
    const type = String(stepType).toUpperCase();
    return STEP_TYPE_ICONS[type];
}

