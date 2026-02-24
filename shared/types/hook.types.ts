/**
 * Hook Types
 */

import { JsonObject } from './json.types';

/**
 * Hook stage values - matches string literals used in runtime orchestration
 */
export type HookStageValue =
    | 'BEFORE_EXTRACT'
    | 'AFTER_EXTRACT'
    | 'BEFORE_TRANSFORM'
    | 'AFTER_TRANSFORM'
    | 'BEFORE_VALIDATE'
    | 'AFTER_VALIDATE'
    | 'BEFORE_ENRICH'
    | 'AFTER_ENRICH'
    | 'BEFORE_ROUTE'
    | 'AFTER_ROUTE'
    | 'BEFORE_LOAD'
    | 'AFTER_LOAD'
    | 'BEFORE_EXPORT'
    | 'AFTER_EXPORT'
    | 'BEFORE_FEED'
    | 'AFTER_FEED'
    | 'BEFORE_SINK'
    | 'AFTER_SINK'
    | 'ON_ERROR'
    | 'ON_RETRY'
    | 'ON_DEAD_LETTER'
    | 'PIPELINE_STARTED'
    | 'PIPELINE_COMPLETED'
    | 'PIPELINE_FAILED';

/**
 * Hook action types
 */
export type HookActionType = 'WEBHOOK' | 'EMIT' | 'TRIGGER_PIPELINE' | 'LOG' | 'INTERCEPTOR' | 'SCRIPT';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface HookActionBase {
    type: HookActionType;
    name?: string;
}

export interface WebhookHookAction extends HookActionBase {
    type: 'WEBHOOK';
    url: string;
    headers?: Record<string, string>;
    secret?: string;
    signatureHeader?: string;
    retryConfig?: {
        maxAttempts: number;
        initialDelayMs: number;
        maxDelayMs: number;
        backoffMultiplier: number;
    };
}

interface EmitHookAction extends HookActionBase {
    type: 'EMIT';
    event: string;
}

interface TriggerPipelineHookAction extends HookActionBase {
    type: 'TRIGGER_PIPELINE';
    pipelineCode: string;
}

export interface LogHookAction extends HookActionBase {
    type: 'LOG';
    level?: LogLevel;
    message?: string;
}

export interface InterceptorHookAction extends HookActionBase {
    type: 'INTERCEPTOR';
    code: string;
    timeout?: number;
    failOnError?: boolean;
}

export interface ScriptHookAction extends HookActionBase {
    type: 'SCRIPT';
    scriptName: string;
    args?: JsonObject;
    timeout?: number;
    failOnError?: boolean;
}

export type HookAction =
    | WebhookHookAction
    | EmitHookAction
    | TriggerPipelineHookAction
    | LogHookAction
    | InterceptorHookAction
    | ScriptHookAction;

type HookConfigType = 'WEBHOOK' | 'EMIT' | 'LOG';

export interface HookConfig {
    type: HookConfigType;
    url?: string;
    event?: string;
    headers?: Record<string, string>;
}

export type PipelineHooksConfig = Partial<Record<HookStageValue, HookConfig[]>>;

export type PipelineHooks = Partial<Record<HookStageValue, HookAction[]>>;

/**
 * Shared HookContext - serializable format with string IDs and metadata.
 *
 * Parallel definition in src/sdk/types/pipeline-types.ts is the runtime
 * version with Vendure RequestContext and readonly fields (immutable
 * contract for custom hook implementors).
 */
export interface HookContext {
    pipelineId: string;
    runId: string;
    stage: HookStageValue;
    stepKey?: string;
    records?: readonly JsonObject[];
    error?: Error;
    metadata?: JsonObject;
}

export type HookHandler = (context: HookContext) => Promise<void>;

export interface InterceptorResult {
    records: JsonObject[];
    modified: boolean;
    errors?: Array<{ action: string; error: string }>;
}

export type ScriptFunction = (
    records: readonly JsonObject[],
    context: HookContext,
    args?: JsonObject,
) => Promise<JsonObject[]> | JsonObject[];
