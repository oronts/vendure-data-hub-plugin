export {
    DATAHUB_PLUGIN_OPTIONS,
    LOGGER_CTX,
    QUEUE_NAMES,
    NAV,
    LOGGER_CONTEXTS,
} from './core';
export type { QueueName } from './core';

export * from './enums';

// Export all defaults from the new modular structure
export {
    // Core defaults
    RETENTION,
    PORTS,
    TRANSFORM_LIMITS,
    INTERNAL_TIMINGS,

    // Batch processing
    BATCH,
    BATCH_ROLLBACK,

    // Sink and queues
    SINK,
    WEBHOOK_QUEUE,
    THROUGHPUT,

    // Scheduler
    SCHEDULER,

    // Webhooks
    WEBHOOK,

    // Storage
    FILE_STORAGE,
    getOutputPath,

    // Security
    CODE_SECURITY,

    // HTTP and network
    HTTP,
    HTTP_STATUS,

    // UI and display
    PAGINATION_PARAMS,
    PAGINATION,
    TRUNCATION,

    // Reliability
    RATE_LIMIT,
    CONNECTION_POOL,
    CIRCUIT_BREAKER,
    DISTRIBUTED_LOCK,
    METRICS,
    CACHE,

    // Runtime
    SANDBOX,
    HOOK,
    SPAN_TRACKER,
    QUEUE,
    DOMAIN_EVENTS,
    RISK_THRESHOLDS,
    IMPACT_ANALYSIS,

    // Parsers
    XML_PARSER,
    VALIDATION_FIELDS,
} from './defaults';

export {
    TIME_UNITS,
    UI_TIMEOUTS,
    CRON,
    TIME,
    calculateThroughput,
} from './time';

export {
    WEIGHT_UNITS,
    LENGTH_UNITS,
    VOLUME_UNITS,
    UNIT_CONVERSIONS,
} from './units';

export {
    EXAMPLE_URLS,
    SERVICE_DEFAULTS,
    FEED_NAMESPACES,
    CONTENT_TYPES,
    EXTENSION_MIME_MAP,
    HTTP_HEADERS,
    AUTH_SCHEMES,
    SERVICE_URL_TEMPLATES,
    XML_NAMESPACES,
    FEED_FORMATS,
    FEED_FORMAT_MAP,
} from './services';
export type { FeedFormatInfo } from './services';

export {
    VALIDATION_PATTERNS,
    FIELD_LIMITS,
    scoreToConfidence,
    confidenceToMinScore,
} from './validation';
export type { MatchConfidence } from './validation';

export { STEP_TYPE_TO_ADAPTER_TYPE, EXTRACTOR_CODE, LOADER_CODE, EXPORTER_CODE, FEED_CODE, SINK_CODE, EXPORT_ADAPTER_CODES, FEED_ADAPTER_CODES } from './adapters';
export type { ExtractorCode, LoaderCode, ExporterCode, FeedCode } from './adapters';

export {
    EMAIL_PATTERN,
} from './patterns';

export {
    LABEL_OVERRIDES,
    toLabel,
    enumToOptions,
    LOAD_STRATEGY_METADATA,
    CONFLICT_STRATEGY_METADATA,
    LOAD_STRATEGY_DESCRIPTIONS,
    CONFLICT_STRATEGY_DESCRIPTIONS,
    STEP_TYPE_CONFIGS,
    COMPARISON_OPERATORS,
} from './enum-metadata';
export type {
    OptionValue,
    SchemaFieldDefinition,
    TypedOptionValue,
    ComparisonOperatorValue,
    AdapterCodeMapping,
    StepTypeConfig,
} from './enum-metadata';

export {
    TRIGGER_TYPE_SCHEMAS,
    COMPRESSION_TYPES,
    CLEANUP_STRATEGIES,
    DESTINATION_TYPES,
    APPROVAL_TYPES,
    BACKOFF_STRATEGIES,
    ENRICHMENT_SOURCE_TYPES,
    VALIDATION_RULE_TYPES,
    WIZARD_STRATEGY_MAPPINGS,
    QUERY_TYPE_OPTIONS,
    CRON_PRESETS,
    ACK_MODE_OPTIONS,
} from './adapter-schema-options';

import { AdapterDefinition } from '../sdk/types';
import { EXTRACTOR_ADAPTERS } from '../extractors/extractor-handler-registry';
import { LOADER_ADAPTERS } from '../runtime/executors/loaders/loader-handler-registry';
import { EXPORTER_ADAPTERS } from '../runtime/executors/exporters/export-handler-registry';
import { FEED_ADAPTERS } from '../runtime/executors/feeds/feed-handler-registry';
import { SINK_ADAPTERS } from '../runtime/executors/sink-handler-registry';
import { ALL_OPERATOR_DEFINITIONS } from '../operators';
import { ENRICHER_ADAPTER_DEFINITIONS } from '../enrichers';

export const BUILTIN_ADAPTERS: AdapterDefinition[] = [
    ...EXTRACTOR_ADAPTERS,
    ...ALL_OPERATOR_DEFINITIONS,
    ...LOADER_ADAPTERS,
    ...EXPORTER_ADAPTERS,
    ...FEED_ADAPTERS,
    ...SINK_ADAPTERS,
    ...ENRICHER_ADAPTER_DEFINITIONS,
];

export { EXTRACTOR_ADAPTERS } from '../extractors/extractor-handler-registry';
export { LOADER_ADAPTERS } from '../runtime/executors/loaders/loader-handler-registry';
export { EXPORTER_ADAPTERS } from '../runtime/executors/exporters/export-handler-registry';
export { FEED_ADAPTERS } from '../runtime/executors/feeds/feed-handler-registry';
export { SINK_ADAPTERS } from '../runtime/executors/sink-handler-registry';
export {
    DEFAULT_WEBHOOK_CONFIG,
} from './trigger-adapters';
export type { WebhookAuthType, WebhookTriggerConfig, MessageTriggerConfig } from './trigger-adapters';

export { CONNECTION_SCHEMAS } from './connection-schemas';
export type { ConnectionSchema, ConnectionSchemaField } from './connection-schemas';

export { DESTINATION_SCHEMAS } from './destination-schemas';
export type { DestinationSchema } from './destination-schemas';

export { RESOLVER_ERROR_MESSAGES } from './resolver-errors';

export { HOOK_STAGE_METADATA, HOOK_STAGE_CATEGORIES } from './hook-stage-metadata';
export type { HookStageMetadata, HookStageCategoryMetadata } from './hook-stage-metadata';

export {
    RUN_EVENT_TYPES,
    WEBHOOK_EVENT_TYPES,
    STEP_EVENT_TYPES,
    GATE_EVENT_TYPES,
    TRIGGER_EVENT_TYPES,
    LOG_EVENT_TYPES,
    PIPELINE_EVENT_TYPES,
    INTERNAL_EVENT_TYPES,
} from './events';
export type {
    RunEventType,
    WebhookEventType,
    StepEventType,
    GateEventType,
    TriggerEventType,
    LogEventType,
    PipelineEventType,
} from './events';
