/**
 * Step type configuration data -- single source of truth.
 *
 * Both the backend (`src/constants/enum-metadata.ts`) and the dashboard
 * (`dashboard/constants/steps.ts`) derive their step configs from this
 * shared array.  Any change here propagates to both sides automatically.
 */

import type { StepType } from '../types';

/**
 * Shape of a step type config entry in the shared array.
 *
 * Mirrors both the backend `StepTypeConfig` and the dashboard `StepConfig`.
 * The backend adds `category` (same value as `nodeType`) on top of this.
 */
export interface SharedStepTypeConfig {
    readonly type: StepType;
    readonly label: string;
    readonly description: string;
    /** Lucide icon name (PascalCase) */
    readonly icon: string;
    readonly color: string;
    readonly bgColor: string;
    readonly borderColor: string;
    readonly inputs: number;
    readonly outputs: number;
    /** Backend adapter type for registry lookup (e.g. EXTRACTOR, OPERATOR). Null for step types without adapters. */
    readonly adapterType: string | null;
    /** Visual node type for the pipeline editor (e.g. source, transform, load). */
    readonly nodeType: string;
    /** Default config values when adding a new step of this type in the pipeline editor. */
    readonly defaultConfig?: Readonly<Record<string, unknown>>;
}

/**
 * Canonical step type configuration array.
 *
 * Order follows the typical pipeline flow: trigger -> extract -> transform ->
 * validate -> enrich -> route -> load -> export -> feed -> sink -> gate.
 */
export const SHARED_STEP_TYPE_CONFIGS: readonly SharedStepTypeConfig[] = [
    { type: 'TRIGGER', label: 'Trigger', description: 'Start point for the pipeline', icon: 'Play', color: '#6366f1', bgColor: '#eef2ff', borderColor: '#a5b4fc', inputs: 0, outputs: 1, adapterType: 'TRIGGER', nodeType: 'trigger', defaultConfig: { type: 'MANUAL', enabled: true } },
    { type: 'EXTRACT', label: 'Extract', description: 'Pull data from external sources', icon: 'Download', color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#93c5fd', inputs: 1, outputs: 1, adapterType: 'EXTRACTOR', nodeType: 'source' },
    { type: 'TRANSFORM', label: 'Transform', description: 'Map and modify data fields', icon: 'RefreshCw', color: '#8b5cf6', bgColor: '#f5f3ff', borderColor: '#c4b5fd', inputs: 1, outputs: 1, adapterType: 'OPERATOR', nodeType: 'transform' },
    { type: 'VALIDATE', label: 'Validate', description: 'Check data against rules', icon: 'CheckCircle', color: '#f59e0b', bgColor: '#fffbeb', borderColor: '#fcd34d', inputs: 1, outputs: 1, adapterType: 'VALIDATOR', nodeType: 'validate', defaultConfig: { mode: 'FAIL_FAST' } },
    { type: 'ENRICH', label: 'Enrich', description: 'Add or enrich data fields', icon: 'Sparkles', color: '#10b981', bgColor: '#ecfdf5', borderColor: '#6ee7b7', inputs: 1, outputs: 1, adapterType: 'ENRICHER', nodeType: 'enrich' },
    { type: 'ROUTE', label: 'Route', description: 'Branch data based on conditions', icon: 'GitBranch', color: '#f97316', bgColor: '#fff7ed', borderColor: '#fdba74', inputs: 1, outputs: 2, adapterType: 'ROUTER', nodeType: 'condition', defaultConfig: { branches: [] } },
    { type: 'LOAD', label: 'Load', description: 'Write data to Vendure', icon: 'Upload', color: '#ef4444', bgColor: '#fef2f2', borderColor: '#fca5a5', inputs: 1, outputs: 0, adapterType: 'LOADER', nodeType: 'load' },
    { type: 'EXPORT', label: 'Export', description: 'Export data to external systems', icon: 'FileOutput', color: '#ec4899', bgColor: '#fdf2f8', borderColor: '#f9a8d4', inputs: 1, outputs: 0, adapterType: 'EXPORTER', nodeType: 'export' },
    { type: 'FEED', label: 'Feed', description: 'Generate product feeds for marketplaces', icon: 'Rss', color: '#06b6d4', bgColor: '#ecfeff', borderColor: '#67e8f9', inputs: 1, outputs: 0, adapterType: 'FEED', nodeType: 'feed' },
    { type: 'SINK', label: 'Sink', description: 'Index data to search engines', icon: 'Search', color: '#84cc16', bgColor: '#f7fee7', borderColor: '#bef264', inputs: 1, outputs: 0, adapterType: 'SINK', nodeType: 'sink' },
    { type: 'GATE', label: 'Gate', description: 'Pause for human approval before continuing', icon: 'ShieldCheck', color: '#d97706', bgColor: '#fffbeb', borderColor: '#fbbf24', inputs: 1, outputs: 1, adapterType: null, nodeType: 'gate' },
] as const;
