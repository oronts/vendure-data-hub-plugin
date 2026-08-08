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

interface BaseVisualNodeConfig {
    color: string;
    icon: LucideIcon;
    hasSourceHandle: boolean;
    hasTargetHandle: boolean;
}

interface FallbackVisualNodeConfig extends BaseVisualNodeConfig {
    textSource: 'FALLBACK';
}

interface BackendVisualNodeConfig extends BaseVisualNodeConfig {
    label: string;
    description: string;
    textSource: 'BACKEND';
}

export type VisualNodeConfig = FallbackVisualNodeConfig | BackendVisualNodeConfig;

export interface VisualNodeText {
    label: string;
    description: string;
}

/**
 * Static fallback visual node configs used during loading before backend data arrives.
 * At runtime, prefer `buildVisualNodeConfigs()` with backend-driven step configs.
 */
export const VISUAL_NODE_CONFIGS: Record<VisualNodeCategory, VisualNodeConfig> = {
    trigger: {
        color: CATEGORY_COLORS.trigger,
        icon: Play,
        textSource: 'FALLBACK',
        hasSourceHandle: true,
        hasTargetHandle: false,
    },
    source: {
        color: CATEGORY_COLORS.source,
        icon: Globe,
        textSource: 'FALLBACK',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    transform: {
        color: CATEGORY_COLORS.transform,
        icon: RefreshCw,
        textSource: 'FALLBACK',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    validate: {
        color: CATEGORY_COLORS.validate,
        icon: CheckCircle,
        textSource: 'FALLBACK',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    enrich: {
        color: CATEGORY_COLORS.enrich,
        icon: Sparkles,
        textSource: 'FALLBACK',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    condition: {
        color: CATEGORY_COLORS.condition,
        icon: GitBranch,
        textSource: 'FALLBACK',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    load: {
        color: CATEGORY_COLORS.load,
        icon: Upload,
        textSource: 'FALLBACK',
        hasSourceHandle: false,
        hasTargetHandle: true,
    },
    export: {
        color: CATEGORY_COLORS.export,
        icon: Download,
        textSource: 'FALLBACK',
        hasSourceHandle: false,
        hasTargetHandle: true,
    },
    feed: {
        color: CATEGORY_COLORS.feed,
        icon: Rss,
        textSource: 'FALLBACK',
        hasSourceHandle: false,
        hasTargetHandle: true,
    },
    sink: {
        color: CATEGORY_COLORS.sink,
        icon: Search,
        textSource: 'FALLBACK',
        hasSourceHandle: false,
        hasTargetHandle: true,
    },
    filter: {
        color: CATEGORY_COLORS.filter,
        icon: Filter,
        textSource: 'FALLBACK',
        hasSourceHandle: true,
        hasTargetHandle: true,
    },
    gate: {
        color: CATEGORY_COLORS.gate,
        icon: ShieldCheck,
        textSource: 'FALLBACK',
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
            textSource: 'BACKEND',
            hasSourceHandle: config.outputs > 0,
            hasTargetHandle: config.inputs > 0,
        };
    }

    return result;
}

export function resolveVisualNodeText(
    config: VisualNodeConfig,
    fallback: VisualNodeText,
): VisualNodeText {
    if (config.textSource === 'BACKEND') {
        return { label: config.label, description: config.description };
    }

    return fallback;
}

export function getVisualNodeConfig(category: VisualNodeCategory): VisualNodeConfig {
    return VISUAL_NODE_CONFIGS[category] ?? VISUAL_NODE_CONFIGS.transform;
}
