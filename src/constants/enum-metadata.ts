/**
 * Centralized metadata for enums used by the GraphQL config options API.
 *
 * Descriptions, icons, label overrides, and step type configurations
 * live here so that the resolver is a thin query layer.
 */
import {
    LoadStrategy,
    ConflictStrategy,
} from './enums';
import { SHARED_STEP_TYPE_CONFIGS } from '../../shared/constants/step-type-configs';

// ---------------------------------------------------------------------------
// Shared interfaces for config option values
// ---------------------------------------------------------------------------

export interface OptionValue {
    value: string;
    label: string;
    description?: string;
    /** Lucide icon name (kebab-case) for UI display */
    icon?: string;
    /** Hex color code for UI display (e.g. '#3b82f6') */
    color?: string;
    /** Optional category for UI grouping (e.g. Catalog, Orders) */
    category?: string;
}

export interface SchemaFieldDefinition {
    key: string;
    label: string;
    /** Field type: 'string', 'number', 'select', 'boolean', 'password', 'keyValuePairs', 'entitySelect', 'secret' */
    type: string;
    required?: boolean;
    placeholder?: string;
    defaultValue?: unknown;
    description?: string;
    options?: Array<{ value: string; label: string }>;
    /** Reference to a dynamic option list served by configOptions (e.g. 'authTypes', 'queueTypes', 'vendureEvents') */
    optionsRef?: string;
}

export interface TypedOptionValue extends OptionValue {
    /** Form field definitions for this option type */
    fields: SchemaFieldDefinition[];
    /** Default values when creating a new entry of this type (JSON object) */
    defaultValues?: Record<string, unknown>;
    /** Key map for converting wizard field names to pipeline config keys */
    configKeyMap?: Record<string, string>;
    /** Which wizard scopes this option appears in (e.g. 'import', 'export') */
    wizardScopes?: string[];
}

export interface ComparisonOperatorValue {
    value: string;
    label: string;
    description: string;
    valueType?: string;
    noValue?: boolean;
    /** Example value hint shown in the UI for this operator (e.g. regex pattern). */
    example?: string;
}

export interface AdapterCodeMapping {
    value: string;
    label: string;
    adapterCode: string;
}

export interface StepTypeConfig {
    type: string;
    label: string;
    description: string;
    icon: string;
    color: string;
    bgColor: string;
    borderColor: string;
    inputs: number;
    outputs: number;
    category: string;
    /** Backend adapter type for registry lookup (e.g. EXTRACTOR, OPERATOR, LOADER). Null for TRIGGER/GATE/ROUTE. */
    adapterType: string | null;
    /** Visual node type for the pipeline editor (e.g. source, transform, load). */
    nodeType: string;
}

// ---------------------------------------------------------------------------
// Label formatting utilities
// ---------------------------------------------------------------------------

/** Words that should keep specific casing instead of naive Title Case. */
export const LABEL_OVERRIDES: Record<string, string> = {
    API: 'API', AMQP: 'AMQP', AWS: 'AWS', CDC: 'CDC', CSV: 'CSV',
    GZIP: 'GZIP', HMAC: 'HMAC', HTTP: 'HTTP', JSON: 'JSON', JWT: 'JWT',
    OAUTH2: 'OAuth2', RABBITMQ: 'RabbitMQ', S3: 'S3', SFTP: 'SFTP',
    SQS: 'SQS', XML: 'XML', XLSX: 'XLSX', UTF8: 'UTF-8', ZIP: 'ZIP',
};

/** Convert an UPPER_SNAKE enum value to a human-readable label. */
export function toLabel(enumValue: string): string {
    return enumValue
        .split('_')
        .map(word => LABEL_OVERRIDES[word] ?? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/** Convert a string-valued enum object into an OptionValue array. */
export function enumToOptions(
    enumObj: Record<string, string>,
    descriptions?: Record<string, string>,
    iconMap?: Record<string, string>,
    colorMap?: Record<string, string>,
): OptionValue[] {
    return Object.values(enumObj).map(value => ({
        value,
        label: toLabel(value),
        description: descriptions?.[value],
        icon: iconMap?.[value],
        color: colorMap?.[value],
    }));
}

// ---------------------------------------------------------------------------
// Enum descriptions and icons
// ---------------------------------------------------------------------------

/** Combined metadata for LoadStrategy: single source for labels + descriptions. */
export const LOAD_STRATEGY_METADATA: Record<string, { label: string; description: string }> = {
    [LoadStrategy.CREATE]: { label: 'Create only', description: 'Create new records only' },
    [LoadStrategy.UPDATE]: { label: 'Update only', description: 'Update existing records only' },
    [LoadStrategy.UPSERT]: { label: 'Create or Update', description: 'Create or update records' },
    [LoadStrategy.MERGE]: { label: 'Merge', description: 'Merge fields into existing records' },
    [LoadStrategy.SOFT_DELETE]: { label: 'Soft Delete', description: 'Mark records as deleted' },
    [LoadStrategy.HARD_DELETE]: { label: 'Hard Delete', description: 'Permanently delete records' },
};

/** Auto-derived from LOAD_STRATEGY_METADATA */
export const LOAD_STRATEGY_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
    Object.entries(LOAD_STRATEGY_METADATA).map(([k, v]) => [k, v.description]),
);

/** Combined metadata for ConflictStrategy: single source for labels + descriptions. */
export const CONFLICT_STRATEGY_METADATA: Record<string, { label: string; description: string }> = {
    [ConflictStrategy.SOURCE_WINS]: { label: 'Source wins (overwrite)', description: 'Incoming data takes priority' },
    [ConflictStrategy.VENDURE_WINS]: { label: 'Vendure wins (keep existing)', description: 'Existing Vendure data takes priority' },
    [ConflictStrategy.MERGE]: { label: 'Merge (combine fields)', description: 'Merge fields from both sources' },
    [ConflictStrategy.MANUAL_QUEUE]: { label: 'Manual queue', description: 'Queue for manual resolution' },
};

/** Auto-derived from CONFLICT_STRATEGY_METADATA */
export const CONFLICT_STRATEGY_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
    Object.entries(CONFLICT_STRATEGY_METADATA).map(([k, v]) => [k, v.description]),
);

// ---------------------------------------------------------------------------
// Step type visual configuration
// ---------------------------------------------------------------------------

/**
 * Visual and structural configuration for each pipeline step type.
 * Derived from the shared single source of truth (SHARED_STEP_TYPE_CONFIGS).
 * The backend adds `category` (same value as `nodeType`) on top of the shared fields.
 */
export const STEP_TYPE_CONFIGS: StepTypeConfig[] = SHARED_STEP_TYPE_CONFIGS.map(cfg => ({
    ...cfg,
    category: cfg.nodeType,
}));

// ---------------------------------------------------------------------------
// Adapter type metadata
// ---------------------------------------------------------------------------

/** Adapter type tab metadata for the adapters page. */
export const ADAPTER_TYPE_METADATA: OptionValue[] = [
    { value: 'EXTRACTOR', label: 'Extractors', description: 'Data source connectors', icon: 'database' },
    { value: 'OPERATOR', label: 'Operators', description: 'Data transformation operators', icon: 'cog' },
    { value: 'LOADER', label: 'Loaders', description: 'Entity loaders', icon: 'upload' },
    { value: 'EXPORTER', label: 'Exporters', description: 'Data export handlers', icon: 'download' },
    { value: 'FEED', label: 'Feeds', description: 'Feed generators', icon: 'rss' },
    { value: 'SINK', label: 'Sinks', description: 'External service integrations', icon: 'send' },
];

// ---------------------------------------------------------------------------
// Run status metadata
// ---------------------------------------------------------------------------

/** Run status option metadata for filter dropdowns. */
export const RUN_STATUS_OPTIONS: OptionValue[] = [
    { value: 'PENDING', label: 'Pending', description: 'Run is waiting to start', icon: 'clock' },
    { value: 'QUEUED', label: 'Queued', description: 'Run is in the job queue', icon: 'list' },
    { value: 'RUNNING', label: 'Running', description: 'Run is actively executing', icon: 'play' },
    { value: 'PAUSED', label: 'Paused (awaiting approval)', description: 'Run is paused at a gate step', icon: 'pause' },
    { value: 'COMPLETED', label: 'Completed', description: 'Run completed successfully', icon: 'check-circle' },
    { value: 'FAILED', label: 'Failed', description: 'Run encountered an error', icon: 'x-circle' },
    { value: 'TIMEOUT', label: 'Timeout', description: 'Run exceeded time limit', icon: 'timer-off' },
    { value: 'CANCEL_REQUESTED', label: 'Cancel requested', description: 'Cancellation has been requested', icon: 'x' },
    { value: 'CANCELLED', label: 'Cancelled', description: 'Run was cancelled', icon: 'ban' },
];

// ---------------------------------------------------------------------------
// Comparison operators
// ---------------------------------------------------------------------------

/** Comparison operators available for filter/route conditions. */
export const COMPARISON_OPERATORS: ComparisonOperatorValue[] = [
    { value: 'eq', label: 'equals', description: 'Equal to value', valueType: 'any' },
    { value: 'ne', label: 'not equals', description: 'Not equal to value', valueType: 'any' },
    { value: 'gt', label: 'greater than', description: 'Greater than (numeric)', valueType: 'number' },
    { value: 'gte', label: 'greater or equal', description: 'Greater than or equal (numeric)', valueType: 'number' },
    { value: 'lt', label: 'less than', description: 'Less than (numeric)', valueType: 'number' },
    { value: 'lte', label: 'less or equal', description: 'Less than or equal (numeric)', valueType: 'number' },
    { value: 'contains', label: 'contains', description: 'String contains substring', valueType: 'string' },
    { value: 'startsWith', label: 'starts with', description: 'String starts with prefix', valueType: 'string' },
    { value: 'endsWith', label: 'ends with', description: 'String ends with suffix', valueType: 'string' },
    { value: 'in', label: 'in list', description: 'Value is contained in an array', valueType: 'array', example: '["A", "B"]' },
    { value: 'notIn', label: 'not in list', description: 'Value is not in array', valueType: 'array', example: '["X", "Y"]' },
    { value: 'isEmpty', label: 'is empty', description: 'Field is null, undefined, or empty', valueType: 'any', noValue: true },
    { value: 'isNotEmpty', label: 'is not empty', description: 'Field exists and is not empty', valueType: 'any', noValue: true },
    { value: 'exists', label: 'exists', description: 'Field exists in record', valueType: 'any', noValue: true },
    { value: 'notExists', label: 'not exists', description: 'Field does not exist in record', valueType: 'any', noValue: true },
    { value: 'regex', label: 'matches regex', description: 'String matches regular expression', valueType: 'regex', example: '^SKU-\\d+$' },
];
