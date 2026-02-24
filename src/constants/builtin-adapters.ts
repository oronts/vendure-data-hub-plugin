/**
 * Built-in Adapter Aggregation
 *
 * This file aggregates all built-in adapters from their registries.
 * Kept separate from constants/index.ts to avoid circular dependencies.
 */

import type { AdapterDefinition } from '../sdk/types';
import { EXTRACTOR_ADAPTERS } from '../extractors/extractor-handler-registry';
import { LOADER_ADAPTERS } from '../runtime/executors/loaders/loader-handler-registry';
import { EXPORTER_ADAPTERS } from '../runtime/executors/exporters/export-handler-registry';
import { FEED_ADAPTERS } from '../runtime/executors/feeds/feed-handler-registry';
import { SINK_ADAPTERS } from '../runtime/executors/sink-handler-registry';
import { ALL_OPERATOR_DEFINITIONS } from '../operators';
import { ENRICHER_ADAPTER_DEFINITIONS } from '../enrichers';

/**
 * All built-in adapter definitions for the Data Hub plugin.
 * Includes extractors, operators, loaders, exporters, feeds, sinks, and enrichers.
 */
export const BUILTIN_ADAPTERS: AdapterDefinition[] = [
    ...EXTRACTOR_ADAPTERS,
    ...ALL_OPERATOR_DEFINITIONS,
    ...LOADER_ADAPTERS,
    ...EXPORTER_ADAPTERS,
    ...FEED_ADAPTERS,
    ...SINK_ADAPTERS,
    ...ENRICHER_ADAPTER_DEFINITIONS,
];
