export {
    DATAHUB_PLUGIN_OPTIONS,
    LOGGER_CTX,
    QUEUE_NAMES,
    DATAHUB_RUN_QUEUE,
    DATAHUB_SCHEDULE_QUEUE,
    NAV,
    DATAHUB_NAV_ID,
    DATAHUB_NAV_SECTION,
    DATAHUB_ROUTE_BASE,
    LOGGER_CONTEXTS,
} from './core';
export type { QueueName, LoggerContext } from './core';

export * from './enums';

export {
    RETENTION,
    PAGINATION,
    BATCH,
    SCHEDULER,
    WEBHOOK,
    HTTP,
    HTTP_STATUS,
    RATE_LIMIT,
    FILE_STORAGE,
    OUTPUT_PATHS,
    XML_EXPORT,
    UI,
    CACHE,
    EXTRACTOR_LIMITS,
    SPAN_TRACKER,
    TRUNCATION,
    NUMERIC,
    PORTS,
    DOMAIN_EVENTS,
    CONNECTION_POOL,
    CIRCUIT_BREAKER,
    METRICS,
    VALIDATION_TIMEOUTS,
    TRANSFORM_LIMITS,
    VALIDATION_FIELDS,
    DEFAULT_HOSTS,
    DEFAULTS,
} from './defaults';

export {
    TIME_UNITS,
    TIME_INTERVALS,
    UI_TIMEOUTS,
    CRON,
    TIME,
    toMilliseconds,
    calculateThroughput,
} from './time';

export {
    WEIGHT_UNITS,
    LENGTH_UNITS,
    VOLUME_UNITS,
    TEMPERATURE_UNITS,
    UNIT_CONVERSIONS,
    CURRENCY_DECIMALS,
    getCurrencyDecimals,
    convertUnit,
    formatCurrencyValue,
    toCurrencyMinorUnits,
} from './units';
export type { WeightUnit, LengthUnit, VolumeUnit, TemperatureUnit } from './units';

export {
    STEP_ICONS,
    ADAPTER_ICONS,
    STEP_COLORS,
    STATUS_COLORS,
    PIPELINE_STATUS_COLORS,
    NODE_COLORS,
    BRAND_COLORS,
    UI_COLORS,
    DISPLAY_CHARS,
    FILE_SIZE_UNITS,
    FILE_SIZE_BASE,
} from './ui';

export {
    SEARCH_SERVICE_PORTS,
    SEARCH_SERVICE_ENV_VARS,
    getSearchServiceUrl,
    SEARCH_SERVICE_URLS,
    EXAMPLE_URLS,
    SERVICE_DEFAULTS,
    FEED_NAMESPACES,
    RSS_VERSIONS,
    CONTENT_TYPES,
    HTTP_HEADERS,
    OAUTH2_GRANT_TYPES,
    SERVICE_URL_TEMPLATES,
    XML_NAMESPACES,
    FEED_FORMATS,
    FEED_FORMAT_MAP,
} from './services';
export type { FeedFormatInfo } from './services';

export {
    VALIDATION_PATTERNS,
    FIELD_LIMITS,
    VALIDATION_MESSAGES,
    VENDURE_FIELD_REQUIREMENTS,
    CONFIDENCE_THRESHOLDS,
    matchesPattern,
    isWithinLength,
    isWithinRange,
    isValidEmail,
    isValidUrl,
    isValidIsoDate,
    isValidUuid,
    isValidSlug,
    scoreToConfidence,
    confidenceToMinScore,
} from './validation';
export type { MatchConfidence } from './validation';

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
    getErrorSeverity,
} from './error-codes';

import { AdapterDefinition } from '../sdk/types';
import { EXTRACTOR_ADAPTERS } from './extractor-adapters';
import { OPERATOR_ADAPTERS } from './operator-adapters';
import { STRING_OPERATOR_ADAPTERS } from './string-operator-adapters';
import { ARRAY_OPERATOR_ADAPTERS } from './array-operator-adapters';
import { VALUE_OPERATOR_ADAPTERS } from './value-operator-adapters';
import { DATE_OPERATOR_ADAPTERS } from './date-operator-adapters';
import { JSON_OPERATOR_ADAPTERS } from './json-operator-adapters';
import { NUMERIC_OPERATOR_ADAPTERS } from './numeric-operator-adapters';
import { CONDITIONAL_OPERATOR_ADAPTERS } from './conditional-operator-adapters';
import { VALIDATION_OPERATOR_ADAPTERS } from './validation-operator-adapters';
import { LOADER_ADAPTERS } from './loader-adapters';
import { EXPORTER_ADAPTERS } from './exporter-adapters';
import { FEED_ADAPTERS } from './feed-adapters';
import { SINK_ADAPTERS } from './sink-adapters';

export const BUILTIN_ADAPTERS: AdapterDefinition[] = [
    ...EXTRACTOR_ADAPTERS,
    ...OPERATOR_ADAPTERS,
    ...STRING_OPERATOR_ADAPTERS,
    ...ARRAY_OPERATOR_ADAPTERS,
    ...VALUE_OPERATOR_ADAPTERS,
    ...DATE_OPERATOR_ADAPTERS,
    ...JSON_OPERATOR_ADAPTERS,
    ...NUMERIC_OPERATOR_ADAPTERS,
    ...CONDITIONAL_OPERATOR_ADAPTERS,
    ...VALIDATION_OPERATOR_ADAPTERS,
    ...LOADER_ADAPTERS,
    ...EXPORTER_ADAPTERS,
    ...FEED_ADAPTERS,
    ...SINK_ADAPTERS,
];

export { EXTRACTOR_ADAPTERS } from './extractor-adapters';
export { OPERATOR_ADAPTERS } from './operator-adapters';
export { STRING_OPERATOR_ADAPTERS } from './string-operator-adapters';
export { ARRAY_OPERATOR_ADAPTERS } from './array-operator-adapters';
export { VALUE_OPERATOR_ADAPTERS } from './value-operator-adapters';
export { DATE_OPERATOR_ADAPTERS } from './date-operator-adapters';
export { JSON_OPERATOR_ADAPTERS } from './json-operator-adapters';
export { NUMERIC_OPERATOR_ADAPTERS } from './numeric-operator-adapters';
export { CONDITIONAL_OPERATOR_ADAPTERS } from './conditional-operator-adapters';
export { VALIDATION_OPERATOR_ADAPTERS } from './validation-operator-adapters';
export { LOADER_ADAPTERS } from './loader-adapters';
export { EXPORTER_ADAPTERS } from './exporter-adapters';
export { FEED_ADAPTERS } from './feed-adapters';
export { SINK_ADAPTERS } from './sink-adapters';
export {
    WEBHOOK_TRIGGER_SCHEMA_FIELDS,
    DEFAULT_WEBHOOK_CONFIG,
} from './trigger-adapters';
export type { WebhookAuthType, WebhookTriggerConfig } from './trigger-adapters';
