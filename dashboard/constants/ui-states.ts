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
export type PanelVariant = typeof PANEL_VARIANT[keyof typeof PANEL_VARIANT];

/** Test/connection status states */
export const TEST_STATUS = {
    IDLE: 'idle',
    TESTING: 'testing',
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
} as const;
export type TestStatus = typeof TEST_STATUS[keyof typeof TEST_STATUS];

/** Result view types */
export const RESULT_VIEW = {
    TABLE: 'table',
    JSON: 'json',
    RAW: 'raw',
} as const;
export type ResultView = typeof RESULT_VIEW[keyof typeof RESULT_VIEW];

/** Checkpoint strategy types */
export const CHECKPOINT_STRATEGY = {
    COUNT: 'COUNT',
    INTERVAL: 'INTERVAL',
    TIMESTAMP: 'TIMESTAMP',
} as const;
export type CheckpointStrategy = typeof CHECKPOINT_STRATEGY[keyof typeof CHECKPOINT_STRATEGY];

/** Adapter type to node type mapping */
export const ADAPTER_TYPE_TO_NODE_TYPE: Record<string, string> = {
    extractor: 'source',
    operator: 'transform',
    validator: 'validate',
    enricher: 'transform',
    router: 'condition',
    loader: 'load',
    exporter: 'export',
    feed: 'feed',
    sink: 'sink',
} as const;

/** Adapter type to category mapping */
export const ADAPTER_TYPE_TO_CATEGORY: Record<string, string> = {
    extractor: 'sources',
    operator: 'transforms',
    validator: 'validation',
    enricher: 'transforms',
    router: 'routing',
    loader: 'destinations',
    exporter: 'exports',
    feed: 'feeds',
    sink: 'sinks',
} as const;
