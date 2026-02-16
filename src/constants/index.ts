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
    NUMERIC,
    DEFAULT_HOSTS,
    PORTS,
    TRANSFORM_LIMITS,
    INTERNAL_TIMINGS,

    // Batch processing
    BATCH,
    BATCH_ROLLBACK,
    STREAMING,

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
    SAFE_EVALUATOR,

    // HTTP and network
    HTTP,
    HTTP_STATUS,
    HTTP_LOOKUP,
    VALIDATION_TIMEOUTS,

    // UI and display
    PAGINATION_PARAMS,
    PAGINATION,
    UI,
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
    TIME_INTERVALS,
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
    CURRENCY_DECIMALS,
    convertUnit,
} from './units';

export {
    SEARCH_SERVICE_URLS,
    EXAMPLE_URLS,
    SERVICE_DEFAULTS,
    FEED_NAMESPACES,
    CONTENT_TYPES,
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
    ERROR_MESSAGES,
    CONFIDENCE_THRESHOLDS,
    matchesPattern,
    isValidEmail,
    isValidUrl,
    scoreToConfidence,
    confidenceToMinScore,
} from './validation';
export type { MatchConfidence } from './validation';

export { EXTRACTOR_CODE, LOADER_CODE, EXPORTER_CODE, FEED_CODE } from './adapters';
export type { ExtractorCode, LoaderCode, ExporterCode, FeedCode } from './adapters';

// Export patterns as the canonical source for all regex patterns
export {
    PATTERNS,
    EMAIL_PATTERN,
    PIPELINE_CODE_PATTERN,
    SLUG_PATTERN,
    URL_PATTERN,
    ISO_DATE_PATTERN,
    UUID_PATTERN,
    PHONE_PATTERN,
    SQL_IDENTIFIER_PATTERN,
    isValidPipelineCode,
} from './patterns';

export {
    PipelineErrorCode,
    ExtractorErrorCode,
    LoaderErrorCode,
    TransformErrorCode,
    WebhookErrorCode,
    ConnectionErrorCode,
    SchemaErrorCode,
    ERROR_CODES,
    ErrorSeverity,
    isRetryableError,
} from './error-codes';

import { AdapterDefinition } from '../sdk/types';
import { EXTRACTOR_ADAPTERS } from './extractor-adapters';
import { LOADER_ADAPTERS } from './loader-adapters';
import { EXPORTER_ADAPTERS } from './exporter-adapters';
import { FEED_ADAPTERS } from './feed-adapters';
import { SINK_ADAPTERS } from './sink-adapters';
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

export { EXTRACTOR_ADAPTERS } from './extractor-adapters';
export { LOADER_ADAPTERS } from './loader-adapters';
export { EXPORTER_ADAPTERS } from './exporter-adapters';
export { FEED_ADAPTERS } from './feed-adapters';
export { SINK_ADAPTERS, SINK_ADAPTER_CODES } from './sink-adapters';
export { ENRICHER_ADAPTER_DEFINITIONS } from '../enrichers';
export {
    ALL_OPERATOR_DEFINITIONS,
    DATA_OPERATOR_DEFINITIONS,
    STRING_OPERATOR_DEFINITIONS,
    LOGIC_OPERATOR_DEFINITIONS,
    ENRICHMENT_OPERATOR_DEFINITIONS,
    AGGREGATION_OPERATOR_DEFINITIONS,
    NUMERIC_OPERATOR_DEFINITIONS,
    DATE_OPERATOR_DEFINITIONS,
    JSON_OPERATOR_DEFINITIONS,
    VALIDATION_OPERATOR_DEFINITIONS,
} from '../operators';
export {
    DEFAULT_WEBHOOK_CONFIG,
} from './trigger-adapters';
export type { WebhookAuthType, WebhookTriggerConfig, MessageTriggerConfig } from './trigger-adapters';

export { RUN_EVENT_TYPES, WEBHOOK_EVENT_TYPES, STEP_EVENT_TYPES, LOG_EVENT_TYPES } from './events';

export { RESOLVER_ERROR_MESSAGES } from './resolver-errors';

export { TABLE_NAMES } from './table-names';

export {
    SQL_IDENTIFIER_MAX_LENGTH,
    SQL_CHECK_MAX_LENGTH,
    SQL_PATTERNS,
} from './sql';

