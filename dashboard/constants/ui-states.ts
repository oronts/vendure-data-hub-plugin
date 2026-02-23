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

export { CHECKPOINT_STRATEGY } from '../../shared/constants';
