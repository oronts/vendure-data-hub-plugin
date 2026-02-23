/**
 * Minimal loading-state fallbacks for page-structural elements only.
 *
 * Most option lists (run statuses, log levels, HTTP methods, etc.) no longer
 * have frontend fallbacks. Their consumers use the backend data directly via
 * `useOptionValues()` and render loading states (disabled selects, skeletons)
 * while the GraphQL config query resolves.
 *
 * Only two fallbacks remain:
 * - FALLBACK_ADAPTER_TYPE_TABS: defines page tab structure (empty tabs = broken page)
 * - FALLBACK_STAGE_CATEGORIES: defines hook stage category layout (empty = broken grid)
 *
 * These are intentionally kept because their consumers need structural data
 * before the page can render at all, and the values change very rarely.
 */

import type { ConfigOptionValue, HookStageCategoryConfig } from '../hooks/api/use-config-options';

/**
 * Shape of a selectable transformation type in the wizard UI.
 */
export interface TransformTypeOption {
    id: string;
    label: string;
    description: string;
}

/** Fallback adapter type tabs used while backend data is loading.
 * Must stay in sync with ADAPTER_TYPE_METADATA in src/constants/enum-metadata.ts. */
export const FALLBACK_ADAPTER_TYPE_TABS: ConfigOptionValue[] = [
    { value: 'EXTRACTOR', label: 'Extractors', icon: 'database' },
    { value: 'OPERATOR', label: 'Operators', icon: 'cog' },
    { value: 'LOADER', label: 'Loaders', icon: 'upload' },
    { value: 'EXPORTER', label: 'Exporters', icon: 'download' },
    { value: 'FEED', label: 'Feeds', icon: 'rss' },
    { value: 'SINK', label: 'Sinks', icon: 'send' },
];

/** Fallback hook stage categories used while backend metadata is loading */
export const FALLBACK_STAGE_CATEGORIES: HookStageCategoryConfig[] = [
    { key: 'lifecycle', label: 'Lifecycle', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400', description: 'Track pipeline start, completion, and failure', gridClass: 'grid-cols-3', order: 1 },
    { key: 'data', label: 'Data Processing', color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400', description: 'Intercept data at each processing step', gridClass: 'grid-cols-4', order: 2 },
    { key: 'error', label: 'Error Handling', color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400', description: 'Handle errors and retries', gridClass: 'grid-cols-3', order: 3 },
];
