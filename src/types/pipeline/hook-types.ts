/**
 * Hook Type Definitions
 *
 * Types related to pipeline hooks and callback actions.
 * Uses enums from constants for consistency.
 */

import { HookStage, HookActionType } from '../../constants/index';
import { JsonObject } from '../common';

// HOOK STAGES

/**
 * Hook stage type (string literal union for convenience)
 *
 * @deprecated Use HookStage enum from constants instead
 */
export type HookStageType =
    | 'beforePipeline'
    | 'afterPipeline'
    | 'beforeRecord'
    | 'afterRecord'
    | 'onError'
    | 'onComplete';

/**
 * Extended hook stage type matching HookStage enum values
 */
export type HookStageValue =
    | 'beforeExtract'
    | 'afterExtract'
    | 'beforeTransform'
    | 'afterTransform'
    | 'beforeValidate'
    | 'afterValidate'
    | 'beforeEnrich'
    | 'afterEnrich'
    | 'beforeRoute'
    | 'afterRoute'
    | 'beforeLoad'
    | 'afterLoad'
    | 'onError'
    | 'onRetry'
    | 'onDeadLetter'
    | 'pipelineStarted'
    | 'pipelineCompleted'
    | 'pipelineFailed';

// HOOK ACTIONS

/**
 * Base hook action interface
 */
export interface HookActionBase {
    /** Action type identifier */
    type: string;
    /** Optional action name for logging */
    name?: string;
}

/**
 * Webhook hook action - sends HTTP request
 */
export interface WebhookHookAction extends HookActionBase {
    type: 'webhook';
    /** Target URL */
    url: string;
    /** Custom headers */
    headers?: Record<string, string>;
    /** Secret for HMAC signature */
    secret?: string;
    /** Header name for signature (default: X-DataHub-Signature) */
    signatureHeader?: string;
    /** Retry configuration for reliable delivery */
    retryConfig?: {
        maxAttempts: number;
        initialDelayMs: number;
        maxDelayMs: number;
        backoffMultiplier: number;
    };
}

/**
 * Emit hook action - emits Vendure event
 */
export interface EmitHookAction extends HookActionBase {
    type: 'emit';
    /** Event name to emit */
    event: string;
}

/**
 * Trigger pipeline hook action - starts another pipeline
 */
export interface TriggerPipelineHookAction extends HookActionBase {
    type: 'triggerPipeline';
    /** Code of pipeline to trigger */
    pipelineCode: string;
}

/**
 * Log hook action - logs message
 */
export interface LogHookAction extends HookActionBase {
    type: 'log';
    /** Log level */
    level?: 'debug' | 'info' | 'warn' | 'error';
    /** Message template */
    message?: string;
}

/**
 * Interceptor hook action - runs custom code that can modify records
 *
 * This is a powerful hook that allows inline JavaScript to transform records.
 * Use with caution - interceptors run synchronously and can affect pipeline performance.
 *
 * @example
 * {
 *   type: 'interceptor',
 *   name: 'Add computed field',
 *   code: 'records.map(r => ({ ...r, computedField: r.price * r.quantity }))'
 * }
 */
export interface InterceptorHookAction extends HookActionBase {
    type: 'interceptor';
    /**
     * JavaScript code that receives `records` (array) and `context` (HookContext).
     * Must return the modified records array.
     * Code runs in a sandboxed environment with limited globals.
     */
    code: string;
    /**
     * Timeout in milliseconds (default: 5000)
     */
    timeout?: number;
    /**
     * If true, errors in interceptor will stop pipeline execution.
     * If false (default), errors are logged and original records are passed through.
     */
    failOnError?: boolean;
}

/**
 * Script hook action - runs a registered script function by name
 *
 * Unlike interceptor, scripts are pre-registered and type-checked.
 * Preferred for production use.
 */
export interface ScriptHookAction extends HookActionBase {
    type: 'script';
    /**
     * Name of the registered script function
     */
    scriptName: string;
    /**
     * Additional arguments passed to the script
     */
    args?: JsonObject;
    /**
     * Timeout in milliseconds (default: 5000)
     */
    timeout?: number;
    /**
     * If true, errors in script will stop pipeline execution.
     */
    failOnError?: boolean;
}

/**
 * Union of all hook action types
 */
export type HookAction =
    | WebhookHookAction
    | EmitHookAction
    | TriggerPipelineHookAction
    | LogHookAction
    | InterceptorHookAction
    | ScriptHookAction;

// HOOK CONFIGURATION

/**
 * Hook configuration (legacy format)
 */
export interface HookConfig {
    type: 'webhook' | 'emit' | 'log';
    url?: string;
    event?: string;
    headers?: Record<string, string>;
}

/**
 * Pipeline hooks configuration (legacy format)
 */
export type PipelineHooksConfig = Partial<Record<HookStageType, HookConfig[]>>;

/**
 * Pipeline hooks (extended format with HookStage values)
 */
export type PipelineHooks = Partial<Record<HookStageValue, HookAction[]>>;

// HOOK CONTEXT

/**
 * Context passed to hook handlers
 */
export interface HookContext {
    /** Pipeline ID */
    pipelineId: string;
    /** Run ID */
    runId: string;
    /** Hook stage being executed */
    stage: HookStageValue;
    /** Current step key (if applicable) */
    stepKey?: string;
    /** Records being processed (if applicable) */
    records?: readonly JsonObject[];
    /** Error that occurred (for error hooks) */
    error?: Error;
    /** Additional hook metadata */
    metadata?: JsonObject;
}

/**
 * Hook handler function type (observation only)
 */
export type HookHandler = (context: HookContext) => Promise<void>;

/**
 * Interceptor handler function type (can modify records)
 */
export type InterceptorHandler = (
    records: readonly JsonObject[],
    context: HookContext,
) => Promise<JsonObject[] | undefined>;

/**
 * Result from running interceptor hooks
 */
export interface InterceptorResult {
    /** Modified records (or original if not modified) */
    records: JsonObject[];
    /** Whether any interceptor modified the records */
    modified: boolean;
    /** Errors encountered during execution */
    errors?: Array<{ action: string; error: string }>;
}

/**
 * Hook registration
 */
export interface HookRegistration {
    /** Stage to attach hook to */
    stage: HookStageValue;
    /** Handler function */
    handler: HookHandler;
    /** Priority (lower runs first) */
    priority?: number;
}

/**
 * Script function signature for registered scripts
 */
export type ScriptFunction = (
    records: readonly JsonObject[],
    context: HookContext,
    args?: JsonObject,
) => Promise<JsonObject[]> | JsonObject[];
