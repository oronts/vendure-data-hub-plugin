/**
 * Step Types and Configuration
 * Pipeline step type definitions and their visual configurations
 */

// Step type constants
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
} as const;

export type StepType = typeof STEP_TYPES[keyof typeof STEP_TYPES];

// Step configuration interface
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

// Step configuration mapping
export const STEP_CONFIGS: Record<StepType, StepConfig> = {
    TRIGGER: {
        type: 'TRIGGER',
        label: 'Trigger',
        description: 'Start point for the pipeline',
        icon: 'Play',
        color: '#10B981',
        bgColor: '#ECFDF5',
        borderColor: '#6EE7B7',
        inputs: 0,
        outputs: 1,
    },
    EXTRACT: {
        type: 'EXTRACT',
        label: 'Extract',
        description: 'Pull data from external sources',
        icon: 'Download',
        color: '#3B82F6',
        bgColor: '#EFF6FF',
        borderColor: '#93C5FD',
        inputs: 1,
        outputs: 1,
    },
    TRANSFORM: {
        type: 'TRANSFORM',
        label: 'Transform',
        description: 'Map and modify data fields',
        icon: 'RefreshCw',
        color: '#8B5CF6',
        bgColor: '#F5F3FF',
        borderColor: '#C4B5FD',
        inputs: 1,
        outputs: 1,
    },
    VALIDATE: {
        type: 'VALIDATE',
        label: 'Validate',
        description: 'Check data against rules',
        icon: 'CheckCircle',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        borderColor: '#FCD34D',
        inputs: 1,
        outputs: 1,
    },
    ENRICH: {
        type: 'ENRICH',
        label: 'Enrich',
        description: 'Add or enhance data fields',
        icon: 'Sparkles',
        color: '#EC4899',
        bgColor: '#FDF2F8',
        borderColor: '#F9A8D4',
        inputs: 1,
        outputs: 1,
    },
    ROUTE: {
        type: 'ROUTE',
        label: 'Route',
        description: 'Branch data based on conditions',
        icon: 'GitBranch',
        color: '#6366F1',
        bgColor: '#EEF2FF',
        borderColor: '#A5B4FC',
        inputs: 1,
        outputs: 2,
    },
    LOAD: {
        type: 'LOAD',
        label: 'Load',
        description: 'Write data to Vendure',
        icon: 'Upload',
        color: '#14B8A6',
        bgColor: '#F0FDFA',
        borderColor: '#5EEAD4',
        inputs: 1,
        outputs: 0,
    },
    EXPORT: {
        type: 'EXPORT',
        label: 'Export',
        description: 'Export data to external systems',
        icon: 'FileOutput',
        color: '#0EA5E9',
        bgColor: '#F0F9FF',
        borderColor: '#7DD3FC',
        inputs: 1,
        outputs: 0,
    },
    FEED: {
        type: 'FEED',
        label: 'Feed',
        description: 'Generate product feeds for marketplaces',
        icon: 'Rss',
        color: '#F97316',
        bgColor: '#FFF7ED',
        borderColor: '#FDBA74',
        inputs: 1,
        outputs: 0,
    },
    SINK: {
        type: 'SINK',
        label: 'Sink',
        description: 'Index data to search engines',
        icon: 'Search',
        color: '#A855F7',
        bgColor: '#FAF5FF',
        borderColor: '#D8B4FE',
        inputs: 1,
        outputs: 0,
    },
};
