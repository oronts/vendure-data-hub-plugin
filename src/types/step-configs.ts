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

export function isExtractStepConfig(config: unknown): config is TypedExtractorConfig {
    return hasAdapterCode(config);
}

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

export function isValidateStepConfig(config: unknown): config is ValidateStepConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const cfg = config as Record<string, unknown>;
    return 'schemaCode' in cfg || 'adapterCode' in cfg;
}

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

export function isEnrichStepConfig(config: unknown): config is EnrichStepConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const cfg = config as Record<string, unknown>;
    return (
        'adapterCode' in cfg ||
        'defaults' in cfg ||
        'computed' in cfg ||
        'sourceType' in cfg
    );
}

// ============================================================================
// Route Step Config
// ============================================================================

type RouteStepConfigDefinition = RouteConfig & {
    adapterCode?: string;
};

export function isRouteStepConfig(config: unknown): config is RouteStepConfigDefinition {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const cfg = config as Record<string, unknown>;
    return 'branches' in cfg && Array.isArray(cfg.branches);
}

// ============================================================================
// Load Step Config
// ============================================================================

export type LoadStepConfig = TypedLoaderConfig & {
    channelStrategy?: string;
    strategy?: string;
    channel?: string;
};

export function isLoadStepConfig(config: unknown): config is LoadStepConfig {
    return hasAdapterCode(config);
}

// ============================================================================
// Export Step Config
// ============================================================================

export function isExportStepConfig(config: unknown): config is TypedExporterConfig {
    return hasAdapterCode(config);
}

// ============================================================================
// Feed Step Config
// ============================================================================

export function isFeedStepConfig(config: unknown): config is TypedFeedConfig {
    return hasAdapterCode(config);
}

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

export function isSinkStepConfig(config: unknown): config is SinkStepConfig {
    return hasAdapterCode(config);
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

export function assertStepConfig<T>(
    step: PipelineStepDefinition,
    guard: (config: unknown) => config is T,
    stepType: string,
): T {
    if (!guard(step.config)) {
        throw new Error(
            `Invalid configuration for ${stepType} step '${step.key}': ` +
            `expected valid ${stepType} config but got ${JSON.stringify(step.config)}`
        );
    }
    return step.config;
}

export function getStepBranches(step: PipelineStepDefinition): BranchConfig[] {
    const config = step.config as Record<string, unknown> | undefined;
    if (config && 'branches' in config && Array.isArray(config.branches)) {
        return config.branches as BranchConfig[];
    }
    return [];
}
