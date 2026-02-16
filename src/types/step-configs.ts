import type { JsonValue } from '../../shared/types';
import type { PipelineStepDefinition, OperatorConfig } from '../../shared/types';
import type {
    TypedExtractorConfig,
    TypedLoaderConfig,
    TypedExporterConfig,
    TypedFeedConfig,
    SchemaValidatorConfig,
    RouteConfig,
} from '../../shared/types';

// ============================================================================
// Base Step Config Interface
// ============================================================================

/**
 * Base step configuration for pipeline step definitions.
 * Requires `adapterCode` since pipeline definitions must identify the adapter.
 *
 * @see src/runtime/config-types.ts BaseStepConfig - runtime variant where
 *   `adapterCode` is optional because some runtime configs (e.g., inline
 *   transforms like set/remove) don't use named adapters.
 */
export interface BaseStepConfig {
    adapterCode: string;
}

export function hasAdapterCode(config: unknown): config is BaseStepConfig {
    return (
        typeof config === 'object' &&
        config !== null &&
        'adapterCode' in config &&
        typeof (config as BaseStepConfig).adapterCode === 'string'
    );
}

// ============================================================================
// Extract Step Config
// ============================================================================

// ============================================================================
// Transform Step Config
// ============================================================================

export type { OperatorConfig };

export interface BranchConfig {
    name: string;
    when?: Array<{
        field: string;
        cmp: string;
        value: JsonValue;
    }>;
}

export interface TransformStepConfig {
    adapterCode?: string;
    operators?: OperatorConfig[];
    branches?: BranchConfig[];
    mapping?: Record<string, string>;
    passthrough?: boolean;
    templates?: Record<string, string>;
    expression?: string;
    condition?: string;
    thenSet?: Record<string, unknown>;
    elseSet?: Record<string, unknown>;
    /** Per-record retry configuration for transform operators */
    retryPerRecord?: {
        maxRetries: number;
        retryDelayMs?: number;
        backoff?: 'FIXED' | 'EXPONENTIAL';
        retryableErrors?: string[];
    };
}

export function isTransformStepConfig(config: unknown): config is TransformStepConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    // Transform configs may or may not have adapterCode
    // They should have at least one transform-related property
    const cfg = config as Record<string, unknown>;
    return (
        'adapterCode' in cfg ||
        'operators' in cfg ||
        'branches' in cfg ||
        'mapping' in cfg ||
        'templates' in cfg ||
        'expression' in cfg ||
        'condition' in cfg
    );
}

// ============================================================================
// Validate Step Config
// ============================================================================

export type ValidateStepConfig = SchemaValidatorConfig & {
    adapterCode?: string;
};

// ============================================================================
// Enrich Step Config
// ============================================================================

export interface EnrichStepConfig {
    adapterCode?: string;
    defaults?: Record<string, unknown>;
    computed?: Record<string, string>;
    sourceType?: 'VENDURE' | 'HTTP' | 'STATIC';
    matchField?: string;
    selectFields?: string[];
    entity?: string;
    endpoint?: string;
    data?: Record<string, unknown>[];
}

// ============================================================================
// Route Step Config
// ============================================================================

type RouteStepConfigDefinition = RouteConfig & {
    adapterCode?: string;
};

// ============================================================================
// Load Step Config
// ============================================================================

export type LoadStepConfig = TypedLoaderConfig & {
    channelStrategy?: string;
    strategy?: string;
    channel?: string;
};

// ============================================================================
// Sink Step Config
// ============================================================================

export interface SinkStepConfig {
    adapterCode: string;
    connectionCode?: string;
    destination?: string;
    format?: string;
    [key: string]: unknown;
}

// ============================================================================
// Union Type for All Step Configs
// ============================================================================

export type StepConfig =
    | TypedExtractorConfig
    | TransformStepConfig
    | ValidateStepConfig
    | EnrichStepConfig
    | RouteStepConfigDefinition
    | LoadStepConfig
    | TypedExporterConfig
    | TypedFeedConfig
    | SinkStepConfig;

// ============================================================================
// Utility Functions
// ============================================================================

export function getStepConfig<T>(
    step: PipelineStepDefinition,
    guard: (config: unknown) => config is T,
): T | undefined {
    if (guard(step.config)) {
        return step.config;
    }
    return undefined;
}

export function getAdapterCode(step: PipelineStepDefinition): string {
    if (hasAdapterCode(step.config)) {
        return step.config.adapterCode;
    }
    return '';
}

