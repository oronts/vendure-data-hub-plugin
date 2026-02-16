/**
 * Dashboard UI state constants
 */

/** Pipeline editor panel types */
export const PIPELINE_EDITOR_PANEL = {
    STEPS: 'steps',
    TRIGGERS: 'triggers',
    SETTINGS: 'settings',
} as const;
export type PipelineEditorPanel = typeof PIPELINE_EDITOR_PANEL[keyof typeof PIPELINE_EDITOR_PANEL];

/** Component panel variants */
export const PANEL_VARIANT = {
    PANEL: 'panel',
    EDITOR: 'editor',
    MODAL: 'modal',
} as const;
/** Test/connection status states */
export const TEST_STATUS = {
    IDLE: 'idle',
    TESTING: 'testing',
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
} as const;

/** Checkpoint strategy types */
export const CHECKPOINT_STRATEGY = {
    COUNT: 'COUNT',
    INTERVAL: 'INTERVAL',
    TIMESTAMP: 'TIMESTAMP',
} as const;
export type CheckpointStrategy = typeof CHECKPOINT_STRATEGY[keyof typeof CHECKPOINT_STRATEGY];

/** Adapter type to node type mapping */
export const ADAPTER_TYPE_TO_NODE_TYPE: Record<string, string> = {
    EXTRACTOR: 'source',
    OPERATOR: 'transform',
    VALIDATOR: 'validate',
    ENRICHER: 'transform',
    ROUTER: 'condition',
    LOADER: 'load',
    EXPORTER: 'export',
    FEED: 'feed',
    SINK: 'sink',
} as const;

/** Adapter type to category mapping */
export const ADAPTER_TYPE_TO_CATEGORY: Record<string, string> = {
    EXTRACTOR: 'SOURCES',
    OPERATOR: 'TRANSFORMS',
    VALIDATOR: 'VALIDATION',
    ENRICHER: 'TRANSFORMS',
    ROUTER: 'ROUTING',
    LOADER: 'DESTINATIONS',
    EXPORTER: 'EXPORTS',
    FEED: 'FEEDS',
    SINK: 'SINKS',
} as const;
