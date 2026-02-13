import type { JsonValue } from '../../shared/types';
import type { PipelineStepDefinition } from '../../shared/types';
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

export type ExtractStepConfig = TypedExtractorConfig;

export function isExtractStepConfig(config: unknown): config is ExtractStepConfig {
    return hasAdapterCode(config);
}

// ============================================================================
// Transform Step Config
// ============================================================================

export interface OperatorConfig {
    op: string;
    args?: Record<string, unknown>;
}

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

export type ExportStepConfig = TypedExporterConfig;

export function isExportStepConfig(config: unknown): config is ExportStepConfig {
    return hasAdapterCode(config);
}

// ============================================================================
// Feed Step Config
// ============================================================================

export type FeedStepConfig = TypedFeedConfig;

export function isFeedStepConfig(config: unknown): config is FeedStepConfig {
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
    | ExtractStepConfig
    | TransformStepConfig
    | ValidateStepConfig
    | EnrichStepConfig
    | RouteStepConfigDefinition
    | LoadStepConfig
    | ExportStepConfig
    | FeedStepConfig
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
