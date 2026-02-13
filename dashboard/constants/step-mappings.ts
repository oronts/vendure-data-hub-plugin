import type { StepType } from '../../shared/types';
import type { VisualNodeCategory, UINodeStatus } from '../types/pipeline';
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

export const STEP_TYPE_COLORS: Record<string, string> = {
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

export const CATEGORY_COLORS: Record<VisualNodeCategory, string> = {
    trigger: '#6366f1',
    source: '#3b82f6',
    transform: '#8b5cf6',
    validate: '#f59e0b',
    enrich: '#10b981',
    condition: '#f97316',
    load: '#ef4444',
    export: '#ec4899',
    feed: '#06b6d4',
    sink: '#84cc16',
    filter: '#8b5cf6',
};

export function mapStepTypeToCategory(stepType: string): VisualNodeCategory {
    const type = String(stepType).toUpperCase();
    return STEP_TYPE_TO_CATEGORY[type] ?? 'transform';
}

export function mapCategoryToStepType(category: string): StepType {
    return CATEGORY_TO_STEP_TYPE[category] ?? 'TRANSFORM';
}

export const STEP_TYPE_ICONS: Record<string, LucideIcon> = {
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

export const NODE_STATUS_COLORS: Record<UINodeStatus, string> = {
    idle: '#6b7280',
    running: '#3b82f6',
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    testing: '#8b5cf6',
};

export function getStepTypeIcon(stepType: string): LucideIcon | undefined {
    const type = String(stepType).toUpperCase();
    return STEP_TYPE_ICONS[type];
}

