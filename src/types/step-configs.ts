/**
 * Step Configuration Types
 *
 * Strongly-typed interfaces for step configurations to eliminate
 * unsafe `(step.config as any)` patterns throughout the codebase.
 */

import type { JsonObject, JsonValue } from '../../shared/types';
import type { PipelineStepDefinition } from '../../shared/types';
import type {
    TypedExtractorConfig,
    TypedOperatorConfig,
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
 * Base interface for all step configurations that include an adapterCode
 */
export interface BaseStepConfig {
    adapterCode: string;
}

/**
 * Check if a config has an adapterCode property
 */
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

/**
 * Configuration for EXTRACT steps
 */
export type ExtractStepConfig = TypedExtractorConfig;

/**
 * Type guard for ExtractStepConfig
 */
export function isExtractStepConfig(config: unknown): config is ExtractStepConfig {
    return hasAdapterCode(config);
}

// ============================================================================
// Transform Step Config
// ============================================================================

/**
 * Operator configuration used in transform steps (runtime format)
 * Uses 'op' for operator code and 'args' for configuration
 */
export interface OperatorConfig {
    op: string;
    args?: Record<string, unknown>;
}

/**
 * Branch configuration for routing
 */
export interface BranchConfig {
    name: string;
    when?: Array<{
        field: string;
        cmp: string;
        value: JsonValue;
    }>;
}

/**
 * Configuration for TRANSFORM steps
 */
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

/**
 * Type guard for TransformStepConfig
 */
export function isTransformStepConfig(config: unknown): config is TransformStepConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    // Transform configs may or may not have adapterCode
    // They should have at least one transform-related property
    const c = config as Record<string, unknown>;
    return (
        'adapterCode' in c ||
        'operators' in c ||
        'branches' in c ||
        'mapping' in c ||
        'templates' in c ||
        'expression' in c ||
        'condition' in c
    );
}

// ============================================================================
// Validate Step Config
// ============================================================================

/**
 * Configuration for VALIDATE steps
 */
export type ValidateStepConfig = SchemaValidatorConfig & {
    adapterCode?: string;
};

/**
 * Type guard for ValidateStepConfig
 */
export function isValidateStepConfig(config: unknown): config is ValidateStepConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const c = config as Record<string, unknown>;
    return 'schemaCode' in c || 'adapterCode' in c;
}

// ============================================================================
// Enrich Step Config
// ============================================================================

/**
 * Configuration for ENRICH steps
 */
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

/**
 * Type guard for EnrichStepConfig
 */
export function isEnrichStepConfig(config: unknown): config is EnrichStepConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const c = config as Record<string, unknown>;
    return (
        'adapterCode' in c ||
        'defaults' in c ||
        'computed' in c ||
        'sourceType' in c
    );
}

// ============================================================================
// Route Step Config
// ============================================================================

/**
 * Configuration for ROUTE steps (extended from RouteConfig)
 * Named with 'Definition' suffix to avoid conflict with RouteStepConfig from step.types
 */
export type RouteStepConfigDefinition = RouteConfig & {
    adapterCode?: string;
};

/**
 * Type guard for RouteStepConfigDefinition
 */
export function isRouteStepConfig(config: unknown): config is RouteStepConfigDefinition {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const c = config as Record<string, unknown>;
    return 'branches' in c && Array.isArray(c.branches);
}

// ============================================================================
// Load Step Config
// ============================================================================

/**
 * Configuration for LOAD steps
 */
export type LoadStepConfig = TypedLoaderConfig & {
    channelStrategy?: string;
    strategy?: string;
    channel?: string;
};

/**
 * Type guard for LoadStepConfig
 */
export function isLoadStepConfig(config: unknown): config is LoadStepConfig {
    return hasAdapterCode(config);
}

// ============================================================================
// Export Step Config
// ============================================================================

/**
 * Configuration for EXPORT steps
 */
export type ExportStepConfig = TypedExporterConfig;

/**
 * Type guard for ExportStepConfig
 */
export function isExportStepConfig(config: unknown): config is ExportStepConfig {
    return hasAdapterCode(config);
}

// ============================================================================
// Feed Step Config
// ============================================================================

/**
 * Configuration for FEED steps
 */
export type FeedStepConfig = TypedFeedConfig;

/**
 * Type guard for FeedStepConfig
 */
export function isFeedStepConfig(config: unknown): config is FeedStepConfig {
    return hasAdapterCode(config);
}

// ============================================================================
// Sink Step Config
// ============================================================================

/**
 * Configuration for SINK steps
 */
export interface SinkStepConfig {
    adapterCode: string;
    connectionCode?: string;
    destination?: string;
    format?: string;
    [key: string]: unknown;
}

/**
 * Type guard for SinkStepConfig
 */
export function isSinkStepConfig(config: unknown): config is SinkStepConfig {
    return hasAdapterCode(config);
}

// ============================================================================
// Union Type for All Step Configs
// ============================================================================

/**
 * Union of all step configuration types
 */
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

/**
 * Safely get step configuration with type checking
 *
 * @param step - The pipeline step definition
 * @param guard - Type guard function for the expected config type
 * @returns The typed config or undefined if validation fails
 *
 * @example
 * const config = getStepConfig(step, isExtractStepConfig);
 * if (config) {
 *     console.log(config.adapterCode); // Type-safe access
 * }
 */
export function getStepConfig<T>(
    step: PipelineStepDefinition,
    guard: (config: unknown) => config is T,
): T | undefined {
    if (guard(step.config)) {
        return step.config;
    }
    return undefined;
}

/**
 * Get the adapter code from a step configuration safely
 *
 * @param step - The pipeline step definition
 * @returns The adapter code string or empty string if not found
 */
export function getAdapterCode(step: PipelineStepDefinition): string {
    if (hasAdapterCode(step.config)) {
        return step.config.adapterCode;
    }
    return '';
}

/**
 * Assert step config is of expected type, throwing if not
 *
 * @param step - The pipeline step definition
 * @param guard - Type guard function for the expected config type
 * @param stepType - Step type name for error message
 * @returns The typed config
 * @throws Error if config doesn't match expected type
 */
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

/**
 * Get branches from a step config if present
 *
 * @param step - The pipeline step definition
 * @returns Array of branch configs or empty array
 */
export function getStepBranches(step: PipelineStepDefinition): BranchConfig[] {
    const config = step.config as Record<string, unknown> | undefined;
    if (config && 'branches' in config && Array.isArray(config.branches)) {
        return config.branches as BranchConfig[];
    }
    return [];
}
