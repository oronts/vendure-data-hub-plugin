import type { LucideIcon } from 'lucide-react';
import {
    Play,
    Download,
    Upload,
    RefreshCw,
    CheckCircle,
    GitBranch,
    Globe,
    Layers,
    Sparkles,
    Search,
    Rss,
    Filter,
} from 'lucide-react';
import type { VisualNodeCategory } from '../../../types';
import { CATEGORY_COLORS } from '../../../constants/index';

export interface VisualNodeConfig {
    color: string;
    icon: LucideIcon;
    label: string;
    description: string;
    hasSourceHandle: boolean;
    hasTargetHandle: boolean;
}

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
};

export function getVisualNodeConfig(category: VisualNodeCategory): VisualNodeConfig {
    return VISUAL_NODE_CONFIGS[category] ?? VISUAL_NODE_CONFIGS.transform;
}
