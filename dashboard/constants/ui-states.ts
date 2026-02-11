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
export type TestStatus = typeof TEST_STATUS[keyof typeof TEST_STATUS];

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
    EXTRACTOR: 'sources',
    OPERATOR: 'transforms',
    VALIDATOR: 'validation',
    ENRICHER: 'transforms',
    ROUTER: 'routing',
    LOADER: 'destinations',
    EXPORTER: 'exports',
    FEED: 'feeds',
    SINK: 'sinks',
} as const;
