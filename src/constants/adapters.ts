/**
 * Adapter Code Constants
 *
 * Centralized constants for adapter codes and mappings used throughout the DataHub plugin.
 *
 * CODE constants are auto-derived from handler registries -- adding a new adapter
 * to a registry automatically generates its SCREAMING_SNAKE_CASE constant here.
 */

import { AdapterType, StepType } from '../../shared/types';
import { SHARED_STEP_TYPE_CONFIGS } from '../../shared/constants/step-type-configs';

// Re-export auto-derived code constants from handler registries (single source of truth)
export { EXTRACTOR_CODE } from '../extractors/extractor-handler-registry';
export { LOADER_CODE } from '../runtime/executors/loaders/loader-handler-registry';
export { EXPORTER_CODE, EXPORT_ADAPTER_CODES } from '../runtime/executors/exporters/export-handler-registry';
export { FEED_CODE, FEED_ADAPTER_CODES } from '../runtime/executors/feeds/feed-handler-registry';
export { SINK_CODE } from '../runtime/executors/sink-handler-registry';

/** Type representing valid extractor adapter codes */
export type ExtractorCode = string;

/** Type representing valid loader adapter codes */
export type LoaderCode = string;

/** Type representing valid exporter adapter codes */
export type ExporterCode = string;

/** Type representing valid feed adapter codes */
export type FeedCode = string;

/**
 * Maps step types to their corresponding adapter types for registry lookup.
 *
 * Auto-derived from SHARED_STEP_TYPE_CONFIGS.
 * Only step types with non-null adapterType are included.
 * Step types like GATE (adapterType: null) are intentionally omitted.
 *
 * Used by validation to look up adapters in the registry.
 */
export const STEP_TYPE_TO_ADAPTER_TYPE: Partial<Record<StepType, AdapterType>> = Object.fromEntries(
    SHARED_STEP_TYPE_CONFIGS
        .filter(config => config.adapterType !== null)
        .map(config => [config.type, config.adapterType as AdapterType])
);
