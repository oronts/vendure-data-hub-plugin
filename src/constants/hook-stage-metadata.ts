/**
 * Hook stage metadata for all pipeline lifecycle hook stages.
 *
 * This is the single source of truth for hook stage display data.
 * The dashboard consumes this via the dataHubConfigOptions GraphQL query.
 */
import { HookStage } from './enums';

type HookStageCategory = 'lifecycle' | 'data' | 'error';

export interface HookStageCategoryMetadata {
    /** Category key matching the stage category field */
    key: HookStageCategory;
    /** Human-readable label */
    label: string;
    /** CSS color classes for the category badge */
    color: string;
    /** Description of this category */
    description: string;
    /** CSS grid class for layout (e.g. grid-cols-3) */
    gridClass: string;
    /** Display order (lower = first) */
    order: number;
}

export const HOOK_STAGE_CATEGORIES: HookStageCategoryMetadata[] = [
    {
        key: 'lifecycle',
        label: 'Lifecycle',
        color: 'bg-blue-100 text-blue-800',
        description: 'Track pipeline start, completion, and failure',
        gridClass: 'grid-cols-3',
        order: 1,
    },
    {
        key: 'data',
        label: 'Data Processing',
        color: 'bg-green-100 text-green-800',
        description: 'Intercept data at each processing step',
        gridClass: 'grid-cols-4',
        order: 2,
    },
    {
        key: 'error',
        label: 'Error Handling',
        color: 'bg-red-100 text-red-800',
        description: 'Handle errors and retries',
        gridClass: 'grid-cols-3',
        order: 3,
    },
];

export interface HookStageMetadata {
    /** Hook stage key (matches HookStage enum value) */
    key: string;
    /** Human-readable label */
    label: string;
    /** Description of when this stage fires */
    description: string;
    /** Lucide icon name (kebab-case) for UI display */
    icon: string;
    /** Category for grouping in the UI */
    category: HookStageCategory;
}

export const HOOK_STAGE_METADATA: HookStageMetadata[] = [
    // Lifecycle stages
    {
        key: HookStage.PIPELINE_STARTED,
        label: 'Pipeline Started',
        description: 'Triggered when a pipeline run begins',
        icon: 'play',
        category: 'lifecycle',
    },
    {
        key: HookStage.PIPELINE_COMPLETED,
        label: 'Pipeline Completed',
        description: 'Triggered when a pipeline finishes successfully',
        icon: 'check-circle-2',
        category: 'lifecycle',
    },
    {
        key: HookStage.PIPELINE_FAILED,
        label: 'Pipeline Failed',
        description: 'Triggered when a pipeline encounters a fatal error',
        icon: 'x-circle',
        category: 'lifecycle',
    },

    // Data processing stages
    {
        key: HookStage.BEFORE_EXTRACT,
        label: 'Before Extract',
        description: 'Before data is pulled from the source',
        icon: 'database',
        category: 'data',
    },
    {
        key: HookStage.AFTER_EXTRACT,
        label: 'After Extract',
        description: 'After data has been extracted',
        icon: 'database',
        category: 'data',
    },
    {
        key: HookStage.BEFORE_TRANSFORM,
        label: 'Before Transform',
        description: 'Before data transformation begins',
        icon: 'filter',
        category: 'data',
    },
    {
        key: HookStage.AFTER_TRANSFORM,
        label: 'After Transform',
        description: 'After data has been transformed',
        icon: 'filter',
        category: 'data',
    },
    {
        key: HookStage.BEFORE_VALIDATE,
        label: 'Before Validate',
        description: 'Before schema validation runs',
        icon: 'check-circle-2',
        category: 'data',
    },
    {
        key: HookStage.AFTER_VALIDATE,
        label: 'After Validate',
        description: 'After validation completes',
        icon: 'check-circle-2',
        category: 'data',
    },
    {
        key: HookStage.BEFORE_ENRICH,
        label: 'Before Enrich',
        description: 'Before data enrichment step',
        icon: 'zap',
        category: 'data',
    },
    {
        key: HookStage.AFTER_ENRICH,
        label: 'After Enrich',
        description: 'After data has been enriched',
        icon: 'zap',
        category: 'data',
    },
    {
        key: HookStage.BEFORE_ROUTE,
        label: 'Before Route',
        description: 'Before records are routed to destinations',
        icon: 'arrow-right',
        category: 'data',
    },
    {
        key: HookStage.AFTER_ROUTE,
        label: 'After Route',
        description: 'After routing decisions are made',
        icon: 'arrow-right',
        category: 'data',
    },
    {
        key: HookStage.BEFORE_LOAD,
        label: 'Before Load',
        description: 'Before data is written to destination',
        icon: 'upload',
        category: 'data',
    },
    {
        key: HookStage.AFTER_LOAD,
        label: 'After Load',
        description: 'After data has been loaded',
        icon: 'upload',
        category: 'data',
    },

    // Error handling stages
    {
        key: HookStage.ON_ERROR,
        label: 'On Error',
        description: 'When any error occurs during processing',
        icon: 'alert-triangle',
        category: 'error',
    },
    {
        key: HookStage.ON_RETRY,
        label: 'On Retry',
        description: 'When a failed record is retried',
        icon: 'refresh-cw',
        category: 'error',
    },
    {
        key: HookStage.ON_DEAD_LETTER,
        label: 'On Dead Letter',
        description: 'When a record is moved to dead letter queue',
        icon: 'x-circle',
        category: 'error',
    },
];
