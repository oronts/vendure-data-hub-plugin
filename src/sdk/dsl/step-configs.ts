/**
 * Step Configuration Types
 *
 * CANONICAL FIELD NAMES:
 * ======================
 * - `cron` - Cron expression for schedule triggers
 * - `strategy` - Load strategy (create, update, upsert, merge)
 * - `adapterCode` - Adapter identifier for steps
 * - `cmp` - Comparison operator for conditions
 *
 * See src/types/shared/index.ts for the full list of canonical field names.
 */

import { JsonObject, JsonValue, PipelineTrigger, SchemaReference, Throughput } from '../../types/index';
import type { OperatorConfig } from '../../types/step-configs';
import { RouteOperator } from '../constants';

export type { ExtractStepConfig, LoadStepConfig } from './source-load-step-configs';
export type { ExportStepConfig, FeedStepConfig, SinkStepConfig } from './delivery-step-configs';

// TRIGGER CONFIG

/** Canonical trigger contract shared with validation and runtime discovery. */
export type TriggerConfig = PipelineTrigger;

// TRANSFORM STEP CONFIG

export interface TransformStepConfig {
    operators: OperatorConfig[];
    throughput?: Throughput;
    async?: boolean;
    /** Per-record retry configuration for transform operators */
    retryPerRecord?: {
        maxRetries: number;
        retryDelayMs?: number;
        backoff?: 'FIXED' | 'EXPONENTIAL';
        retryableErrors?: string[];
    };
}

export type { OperatorConfig };

// VALIDATE STEP CONFIG

export interface ValidateStepConfig {
    /** Error handling mode: FAIL_FAST stops on first error, ACCUMULATE collects all errors */
    errorHandlingMode?: 'FAIL_FAST' | 'ACCUMULATE';
    /** Validation rules to apply */
    rules?: ValidationRuleConfig[];
    /** Throughput configuration */
    throughput?: Throughput;
    /** Use a named registry schema instead of or alongside inline rules. */
    schemaRef?: SchemaReference;
}

export interface ValidationRuleConfig {
    /** Inline field rule. Use step.schemaRef for registry schema validation. */
    type: 'business';
    /** Rule specification */
    spec: ValidationRuleSpec;
}

export interface ValidationRuleSpec {
    /** Field to validate (supports dot notation for nested fields) */
    field: string;
    /** Whether the field is required */
    required?: boolean;
    /** Primitive value type */
    type?: 'string' | 'number' | 'boolean';
    /** Minimum value for numbers */
    min?: number;
    /** Maximum value for numbers */
    max?: number;
    /** Minimum string length */
    minLength?: number;
    /** Maximum string length */
    maxLength?: number;
    /** Regex pattern for string validation */
    pattern?: string;
    /** Allowed values */
    enum?: JsonValue[];
    /** Custom error message */
    error?: string;
}

// ENRICH STEP CONFIG

export interface EnrichStepConfig {
    /** Custom enricher adapter code (optional if using built-in enrichment) */
    adapterCode?: string;
    /** Static default values to add to records (only if field is missing) */
    defaults?: Record<string, JsonValue>;
    /** Values to always set on records (overwrites existing) */
    set?: Record<string, JsonValue>;
    /** Computed field expressions using ${field} template syntax */
    computed?: Record<string, string>;
    /** Enrichment source type */
    sourceType?: 'STATIC' | 'HTTP' | 'VENDURE';

    // ── HTTP enrichment ─────────────────────────────────────────────────
    /** HTTP endpoint URL. Use {{field.path}} for dynamic values. */
    url?: string;
    /** HTTP method (default: GET) */
    method?: 'GET' | 'POST';
    /** Record field to use as the lookup cache key */
    keyField?: string;
    /** Field name to store enrichment result on each record (default: 'enrichment') */
    target?: string;
    /** JSON path to extract from HTTP response (e.g. 'data.items') */
    responsePath?: string;
    /** Cache TTL in seconds */
    cacheTtlSec?: number;
    /** Skip enrichment on 404 instead of failing */
    skipOn404?: boolean;
    /** Fail the entire step on HTTP error */
    failOnError?: boolean;
    /** Secret code for Bearer token authentication */
    bearerTokenSecretCode?: string;
    /** Secret code for API key authentication */
    apiKeySecretCode?: string;
    /** Header name for API key (default: X-Api-Key) */
    apiKeyHeader?: string;
    /** Secret code for Basic auth */
    basicAuthSecretCode?: string;
    /** Custom request headers */
    headers?: Record<string, string>;
    /** Request body for POST method */
    body?: JsonValue;
    /** Field to use as request body */
    bodyField?: string;
    /** Max retry attempts */
    maxRetries?: number;
    /** Batch size for parallel lookups */
    batchSize?: number;
    /** Rate limit (requests per second) */
    rateLimitPerSecond?: number;
    /** Timeout in milliseconds */
    timeoutMs?: number;
    /** Default value if enrichment returns nothing */
    default?: JsonValue;

    // ── VENDURE enrichment ──────────────────────────────────────────────
    /** Vendure entity type (e.g. 'PRODUCT_VARIANT') */
    entityType?: string;
    /** Record field to look up */
    sourceField?: string;
    /** Vendure entity field to match against */
    lookupField?: string;
    /** Specific entity fields to copy into the record */
    targetFields?: Record<string, string>;

    /** Additional adapter config */
    config?: JsonObject;
    throughput?: Throughput;
    async?: boolean;
    [key: string]: unknown;
}

// ROUTE STEP CONFIG

export interface RouteStepConfig {
    branches: RouteBranchConfig[];
    defaultTo?: string;
}

export interface RouteBranchConfig {
    name: string;
    when: RouteConditionConfig[];
}

export interface RouteConditionConfig {
    field: string;
    cmp: RouteOperator;
    value: JsonValue;
}

// GATE STEP CONFIG

export interface GateStepConfig {
    /** Approval type: MANUAL requires human approval, THRESHOLD auto-approves below error rate, TIMEOUT auto-approves after delay */
    approvalType: 'MANUAL' | 'THRESHOLD' | 'TIMEOUT';
    /** Timeout in seconds for TIMEOUT approval type */
    timeoutSeconds?: number;
    /** Error rate threshold (0-100) for THRESHOLD approval type */
    errorThresholdPercent?: number;
    /** Webhook URL to notify when gate is reached */
    notifyWebhook?: string;
    /** Email address to notify when gate is reached */
    notifyEmail?: string;
    /** Number of preview records to include in the gate result (default: 10) */
    previewCount?: number;
}
