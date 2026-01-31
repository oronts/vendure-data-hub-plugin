/**
 * Hook Types
 *
 * HookStageValue uses SCREAMING_SNAKE_CASE to match both the HookStage enum
 * values and the runtime usage patterns throughout the codebase.
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

export interface HookActionBase {
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

export interface EmitHookAction extends HookActionBase {
    type: 'EMIT';
    event: string;
}

export interface TriggerPipelineHookAction extends HookActionBase {
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

export type HookConfigType = 'WEBHOOK' | 'EMIT' | 'LOG';

export interface HookConfig {
    type: HookConfigType;
    url?: string;
    event?: string;
    headers?: Record<string, string>;
}

export type PipelineHooksConfig = Partial<Record<HookStageValue, HookConfig[]>>;

export type PipelineHooks = Partial<Record<HookStageValue, HookAction[]>>;

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

export type InterceptorHandler = (
    records: readonly JsonObject[],
    context: HookContext,
) => Promise<JsonObject[] | undefined>;

export interface InterceptorResult {
    records: JsonObject[];
    modified: boolean;
    errors?: Array<{ action: string; error: string }>;
}

export interface HookRegistration {
    stage: HookStageValue;
    handler: HookHandler;
    priority?: number;
}

export type ScriptFunction = (
    records: readonly JsonObject[],
    context: HookContext,
    args?: JsonObject,
) => Promise<JsonObject[]> | JsonObject[];
