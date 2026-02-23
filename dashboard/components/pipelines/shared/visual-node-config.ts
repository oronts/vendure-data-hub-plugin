import type { LucideIcon } from 'lucide-react';
import {
    Play,
    Download,
    Upload,
    RefreshCw,
    CheckCircle,
    GitBranch,
    Globe,
    Sparkles,
    Search,
    Rss,
    Filter,
    ShieldCheck,
} from 'lucide-react';
import type { VisualNodeCategory } from '../../../types';
import type { StepConfig } from '../../../constants/steps';
import { CATEGORY_COLORS } from '../../../constants/index';
import { resolveIconName } from '../../../utils/icon-resolver';

export interface VisualNodeConfig {
    color: string;
    icon: LucideIcon;
    label: string;
    description: string;
    hasSourceHandle: boolean;
    hasTargetHandle: boolean;
}

/**
 * Static fallback visual node configs used during loading before backend data arrives.
 * At runtime, prefer `buildVisualNodeConfigs()` with backend-driven step configs.
 */
export const VISUAL_NODE_CONFIGS: Record<VisualNodeCategory, VisualNodeConfig> = {
    trigger: {
        color: CATEGORY_COLORS.trigger,
        icon: Play,
        label: 'Trigger',
        description: 'Pipeline trigger',
        hasSourceHandle: true,
        hasTargetHandle: false,
    },
    source: {
        color: CATEGORY_COLORS.source,
        icon: Globe,
        label: 'Source',
        description: 'Data source',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    transform: {
        color: CATEGORY_COLORS.transform,
        icon: RefreshCw,
        label: 'Transform',
        description: 'Transform data',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    validate: {
        color: CATEGORY_COLORS.validate,
        icon: CheckCircle,
        label: 'Validate',
        description: 'Validate data',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    enrich: {
        color: CATEGORY_COLORS.enrich,
        icon: Sparkles,
        label: 'Enrich',
        description: 'Enrich with additional data',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    condition: {
        color: CATEGORY_COLORS.condition,
        icon: GitBranch,
        label: 'Condition',
        description: 'Route based on condition',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    load: {
        color: CATEGORY_COLORS.load,
        icon: Upload,
        label: 'Load',
        description: 'Load to destination',
        hasSourceHandle: false,
        hasTargetHandle: true,
    },
    export: {
        color: CATEGORY_COLORS.export,
        icon: Download,
        label: 'Export',
        description: 'Export to external system',
        hasSourceHandle: false,
        hasTargetHandle: true,
    },
    feed: {
        color: CATEGORY_COLORS.feed,
        icon: Rss,
        label: 'Feed',
        description: 'Generate product feed',
        hasSourceHandle: false,
        hasTargetHandle: true,
    },
    sink: {
        color: CATEGORY_COLORS.sink,
        icon: Search,
        label: 'Sink',
        description: 'Index to search engine',
        hasSourceHandle: false,
        hasTargetHandle: true,
    },
    filter: {
        color: CATEGORY_COLORS.filter,
        icon: Filter,
        label: 'Filter',
        description: 'Filter data',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    gate: {
        color: CATEGORY_COLORS.gate,
        icon: ShieldCheck,
        label: 'Gate',
        description: 'Pause for human approval',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
};

/**
 * Builds visual node configs from backend step config data.
 *
 * Uses the step config's icon name (resolved via lucide-react), color, label,
 * description, and derives handle visibility from inputs/outputs counts.
 *
 * Falls back to the static VISUAL_NODE_CONFIGS for any category not covered
 * by the backend data (e.g. 'filter' which has no step type).
 */
export function buildVisualNodeConfigs(
    stepConfigs: Record<string, StepConfig>,
): Record<VisualNodeCategory, VisualNodeConfig> {
    const result = { ...VISUAL_NODE_CONFIGS };

    for (const config of Object.values(stepConfigs)) {
        const category = config.nodeType as VisualNodeCategory;
        if (!category) continue;

        const resolvedIcon = resolveIconName(config.icon);
        const fallback = VISUAL_NODE_CONFIGS[category];

        result[category] = {
            color: config.color,
            icon: resolvedIcon ?? fallback?.icon ?? RefreshCw,
            label: config.label,
            description: config.description,
            hasSourceHandle: config.outputs > 0,
            hasTargetHandle: config.inputs > 0,
        };
    }

    return result;
}

export function getVisualNodeConfig(category: VisualNodeCategory): VisualNodeConfig {
    return VISUAL_NODE_CONFIGS[category] ?? VISUAL_NODE_CONFIGS.transform;
}
