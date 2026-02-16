import type { StepType } from '../../shared/types';
import { STEP_TYPE_CANONICAL_COLORS } from './StepMappings';

export const STEP_TYPES = {
    TRIGGER: 'TRIGGER',
    EXTRACT: 'EXTRACT',
    TRANSFORM: 'TRANSFORM',
    VALIDATE: 'VALIDATE',
    ENRICH: 'ENRICH',
    ROUTE: 'ROUTE',
    LOAD: 'LOAD',
    EXPORT: 'EXPORT',
    FEED: 'FEED',
    SINK: 'SINK',
    GATE: 'GATE',
} as const satisfies Record<string, StepType>;

export type { StepType } from '../../shared/types';

export interface StepConfig {
    readonly type: StepType;
    readonly label: string;
    readonly description: string;
    readonly icon: string;
    readonly color: string;
    readonly bgColor: string;
    readonly borderColor: string;
    readonly inputs: number;
    readonly outputs: number;
}

/**
 * Step configuration for the pipeline editors.
 * Colors are sourced from STEP_TYPE_CANONICAL_COLORS to stay consistent
 * between the simple editor (StepListItem) and the workflow editor (ReactFlow nodes).
 */
export const STEP_CONFIGS: Record<StepType, StepConfig> = {
    TRIGGER: {
        type: 'TRIGGER',
        label: 'Trigger',
        description: 'Start point for the pipeline',
        icon: 'Play',
        color: STEP_TYPE_CANONICAL_COLORS.TRIGGER,
        bgColor: '#eef2ff',
        borderColor: '#a5b4fc',
        inputs: 0,
        outputs: 1,
    },
    EXTRACT: {
        type: 'EXTRACT',
        label: 'Extract',
        description: 'Pull data from external sources',
        icon: 'Download',
        color: STEP_TYPE_CANONICAL_COLORS.EXTRACT,
        bgColor: '#eff6ff',
        borderColor: '#93c5fd',
        inputs: 1,
        outputs: 1,
    },
    TRANSFORM: {
        type: 'TRANSFORM',
        label: 'Transform',
        description: 'Map and modify data fields',
        icon: 'RefreshCw',
        color: STEP_TYPE_CANONICAL_COLORS.TRANSFORM,
        bgColor: '#f5f3ff',
        borderColor: '#c4b5fd',
        inputs: 1,
        outputs: 1,
    },
    VALIDATE: {
        type: 'VALIDATE',
        label: 'Validate',
        description: 'Check data against rules',
        icon: 'CheckCircle',
        color: STEP_TYPE_CANONICAL_COLORS.VALIDATE,
        bgColor: '#fffbeb',
        borderColor: '#fcd34d',
        inputs: 1,
        outputs: 1,
    },
    ENRICH: {
        type: 'ENRICH',
        label: 'Enrich',
        description: 'Add or enhance data fields',
        icon: 'Sparkles',
        color: STEP_TYPE_CANONICAL_COLORS.ENRICH,
        bgColor: '#ecfdf5',
        borderColor: '#6ee7b7',
        inputs: 1,
        outputs: 1,
    },
    ROUTE: {
        type: 'ROUTE',
        label: 'Route',
        description: 'Branch data based on conditions',
        icon: 'GitBranch',
        color: STEP_TYPE_CANONICAL_COLORS.ROUTE,
        bgColor: '#fff7ed',
        borderColor: '#fdba74',
        inputs: 1,
        outputs: 2,
    },
    LOAD: {
        type: 'LOAD',
        label: 'Load',
        description: 'Write data to Vendure',
        icon: 'Upload',
        color: STEP_TYPE_CANONICAL_COLORS.LOAD,
        bgColor: '#fef2f2',
        borderColor: '#fca5a5',
        inputs: 1,
        outputs: 0,
    },
    EXPORT: {
        type: 'EXPORT',
        label: 'Export',
        description: 'Export data to external systems',
        icon: 'FileOutput',
        color: STEP_TYPE_CANONICAL_COLORS.EXPORT,
        bgColor: '#fdf2f8',
        borderColor: '#f9a8d4',
        inputs: 1,
        outputs: 0,
    },
    FEED: {
        type: 'FEED',
        label: 'Feed',
        description: 'Generate product feeds for marketplaces',
        icon: 'Rss',
        color: STEP_TYPE_CANONICAL_COLORS.FEED,
        bgColor: '#ecfeff',
        borderColor: '#67e8f9',
        inputs: 1,
        outputs: 0,
    },
    SINK: {
        type: 'SINK',
        label: 'Sink',
        description: 'Index data to search engines',
        icon: 'Search',
        color: STEP_TYPE_CANONICAL_COLORS.SINK,
        bgColor: '#f7fee7',
        borderColor: '#bef264',
        inputs: 1,
        outputs: 0,
    },
    GATE: {
        type: 'GATE',
        label: 'Gate',
        description: 'Pause for human approval before continuing',
        icon: 'ShieldCheck',
        color: STEP_TYPE_CANONICAL_COLORS.GATE,
        bgColor: '#fffbeb',
        borderColor: '#fbbf24',
        inputs: 1,
        outputs: 1,
    },
};
