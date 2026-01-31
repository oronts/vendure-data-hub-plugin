import { Injectable, OnModuleInit } from '@nestjs/common';
import { ID, RequestContext } from '@vendure/core';
import {
    PipelineDefinition,
    HookAction,
    HookStageValue,
    JsonObject,
    InterceptorHookAction,
    ScriptHookAction,
    InterceptorResult,
    ScriptFunction,
    HookContext,
    LogHookAction,
} from '../../types/index';
import { DomainEventsService } from './domain-events.service';
import { ModuleRef } from '@nestjs/core';
import { PipelineService } from '../pipeline/pipeline.service';
import { WebhookRetryService, WebhookConfig } from '../webhooks/webhook-retry.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { DEFAULTS, LOGGER_CONTEXTS, HOOK, HTTP_HEADERS, CONTENT_TYPES } from '../../constants/index';
import { HookActionType } from '../../constants/enums';
import { validateUserCode } from '../../utils/code-security.utils';

@Injectable()
export class HookService implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private webhookRetryService: WebhookRetryService | null = null;
    private registeredWebhooks = new Set<string>();
    private registeredScripts = new Map<string, ScriptFunction>();

    constructor(
        private moduleRef: ModuleRef,
        private domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.HOOK_SERVICE);
    }

    /**
     * Register a script function for use in script hooks
     */
    registerScript(name: string, fn: ScriptFunction): void {
        if (this.registeredScripts.has(name)) {
            this.logger.warn(`Script "${name}" is being overwritten`);
        }
        this.registeredScripts.set(name, fn);
        this.logger.info(`Registered script: ${name}`);
    }

    /**
     * Get all registered script names
     */
    getRegisteredScripts(): string[] {
        return Array.from(this.registeredScripts.keys());
    }

    async onModuleInit() {
        // Get webhook retry service if available
        try {
            this.webhookRetryService = this.moduleRef.get(WebhookRetryService, { strict: false });
            if (this.webhookRetryService) {
                this.logger.info('WebhookRetryService connected for reliable webhook delivery');
            }
        } catch {
            this.logger.debug('WebhookRetryService not available, using simple fetch for webhooks');
        }
    }

    async run(
        ctx: RequestContext,
        def: PipelineDefinition,
        stage: HookStageValue,
        payload?: JsonObject | JsonObject[],
        record?: JsonObject,
        runId?: ID,
    ): Promise<void> {
        const actions = (def.hooks?.[stage] ?? []) as HookAction[];
        for (const action of actions) {
            try {
                switch (action.type) {
                    case HookActionType.WEBHOOK:
                        await this.callWebhook(action, { stage, payload: payload ?? null, record: record ?? null, runId: runId?.toString() ?? null });
                        break;
                    case HookActionType.EMIT:
                        this.domainEvents.publish(action.event, { stage, payload, record, runId });
                        break;
                    case HookActionType.TRIGGER_PIPELINE: {
                        try {
                            const pipelineService = this.moduleRef.get(PipelineService, { strict: false });
                            if (pipelineService) {
                                await pipelineService.startRunByCode(ctx, action.pipelineCode, { seedRecords: Array.isArray(payload) ? payload : (record ? [record] : []) });
                            }
                        } catch (error) {
                            this.logger.warn('Failed to trigger pipeline from hook', {
                                stage,
                                pipelineCode: action.pipelineCode,
                                runId,
                                error: (error as Error)?.message,
                            });
                        }
                        break;
                    }
                    case HookActionType.LOG: {
                        const logAction = action as LogHookAction;
                        const level = logAction.level ?? 'INFO';
                        const message = logAction.message ?? `Hook triggered: ${stage}`;
                        const logData = { stage, runId, payload: payload ?? record };
                        switch (level) {
                            case 'DEBUG':
                                this.logger.debug(message, logData);
                                break;
                            case 'INFO':
                                this.logger.info(message, logData);
                                break;
                            case 'WARN':
                                this.logger.warn(message, logData);
                                break;
                            case 'ERROR':
                                this.logger.error(message, undefined, logData);
                                break;
                        }
                        break;
                    }
                    // INTERCEPTOR and SCRIPT are handled by runInterceptors(), not here
                }
            } catch (error) {
                // Hooks are best-effort; log but don't block the pipeline
                this.logger.warn('Hook action failed', {
                    stage,
                    actionType: action.type,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    /**
     * Run interceptor hooks that can modify records
     *
     * Unlike `run()`, this method processes interceptor and script hooks
     * that can transform the records array.
     *
     * @returns InterceptorResult with potentially modified records
     */
    async runInterceptors(
        ctx: RequestContext,
        def: PipelineDefinition,
        stage: HookStageValue,
        records: JsonObject[],
        runId?: ID,
        pipelineId?: ID,
    ): Promise<InterceptorResult> {
        const actions = (def.hooks?.[stage] ?? []) as HookAction[];

        // Filter to only interceptor and script actions
        const interceptorActions = actions.filter(
            (a): a is InterceptorHookAction | ScriptHookAction =>
                a.type === HookActionType.INTERCEPTOR || a.type === HookActionType.SCRIPT,
        );

        if (interceptorActions.length === 0) {
            return { records, modified: false };
        }

        let currentRecords = [...records];
        let modified = false;
        const errors: Array<{ action: string; error: string }> = [];

        const hookContext: HookContext = {
            pipelineId: String(pipelineId ?? ''),
            runId: String(runId ?? ''),
            stage,
            records,
        };

        for (const action of interceptorActions) {
            const actionName = action.name || action.type;
            try {
                let result: JsonObject[] | undefined;

                if (action.type === HookActionType.INTERCEPTOR) {
                    result = await this.executeInterceptor(action, currentRecords, hookContext);
                } else if (action.type === HookActionType.SCRIPT) {
                    result = await this.executeScript(action, currentRecords, hookContext);
                }

                if (result && Array.isArray(result)) {
                    currentRecords = result;
                    modified = true;
                    this.logger.debug(`Interceptor "${actionName}" modified ${result.length} records`, {
                        stage,
                        runId,
                    });
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push({ action: actionName, error: errorMsg });

                this.logger.warn(`Interceptor "${actionName}" failed`, {
                    stage,
                    error: errorMsg,
                    runId,
                });

                // Check if we should fail the pipeline
                const failOnError =
                    (action.type === HookActionType.INTERCEPTOR && action.failOnError) ||
                    (action.type === HookActionType.SCRIPT && action.failOnError);

                if (failOnError) {
                    throw new Error(`Interceptor "${actionName}" failed: ${errorMsg}`);
                }
            }
        }

        // Also run observation-only hooks
        await this.run(ctx, def, stage, currentRecords, undefined, runId);

        return { records: currentRecords, modified, errors: errors.length > 0 ? errors : undefined };
    }

    /**
     * Execute an interceptor hook with inline code
     */
    private async executeInterceptor(
        action: InterceptorHookAction,
        records: JsonObject[],
        context: HookContext,
    ): Promise<JsonObject[] | undefined> {
        const timeout = action.timeout ?? HOOK.INTERCEPTOR_TIMEOUT_MS;

        // Create a sandboxed function with limited globals
        const sandboxGlobals = {
            // Math functions
            Math,
            // Array functions
            Array,
            // Object functions
            Object,
            // String functions
            String,
            // Number functions
            Number,
            // Boolean
            Boolean,
            // JSON functions
            JSON,
            // Type checking
            isNaN,
            isFinite,
            // URI encoding
            encodeURIComponent,
            decodeURIComponent,
            // Console override (redirects to logger)
            console: {
                log: (...args: unknown[]) => this.logger.debug('Interceptor console.log', { consoleArgs: args }),
                warn: (...args: unknown[]) => this.logger.warn('Interceptor console.warn', { consoleArgs: args }),
                error: (...args: unknown[]) => this.logger.warn('Interceptor console.error', { consoleArgs: args }),
            },
            // Provide records and context in scope for interceptor code
            records,
            context,
        };

        // Validate user code before execution
        validateUserCode(action.code);

        // Build function - records and context are available in scope via sandboxGlobals
        const fnBody = `
            "use strict";
            return (async function() {
                ${action.code}
            })();
        `;

        const fn = new Function(...Object.keys(sandboxGlobals), fnBody);

        // Execute with timeout
        const result = await Promise.race([
            fn(...Object.values(sandboxGlobals)),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Interceptor timeout after ${timeout}ms`)), timeout),
            ),
        ]);

        // Validate result
        if (result !== undefined && !Array.isArray(result)) {
            throw new Error('Interceptor must return an array of records or undefined');
        }

        return result as JsonObject[] | undefined;
    }

    /**
     * Execute a registered script hook
     */
    private async executeScript(
        action: ScriptHookAction,
        records: JsonObject[],
        context: HookContext,
    ): Promise<JsonObject[] | undefined> {
        const scriptFn = this.registeredScripts.get(action.scriptName);
        if (!scriptFn) {
            throw new Error(`Script "${action.scriptName}" is not registered`);
        }

        const timeout = action.timeout ?? HOOK.INTERCEPTOR_TIMEOUT_MS;

        // Execute with timeout
        const result = await Promise.race([
            Promise.resolve(scriptFn(records, context, action.args)),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Script timeout after ${timeout}ms`)), timeout),
            ),
        ]);

        return result;
    }

    /**
     * Call webhook with retry support if WebhookRetryService is available
     */
    private async callWebhook(action: HookAction, body: JsonObject): Promise<void> {
        // Type guard to ensure this is a webhook action
        if (action.type !== HookActionType.WEBHOOK) return;

        const webhookAction = action as import('../../types').WebhookHookAction;
        const url = webhookAction.url;
        const headers = webhookAction.headers;

        if (!url) return;

        // Use WebhookRetryService for reliable delivery with retries
        if (this.webhookRetryService) {
            // Generate a unique webhook ID for this URL
            const webhookId = this.getWebhookId(url, webhookAction);

            // Register webhook config if not already registered
            if (!this.registeredWebhooks.has(webhookId)) {
                const config: WebhookConfig = {
                    id: webhookId,
                    url,
                    method: 'POST',
                    headers,
                    secret: webhookAction.secret,
                    signatureHeader: webhookAction.signatureHeader,
                    retryConfig: webhookAction.retryConfig || {
                        maxAttempts: DEFAULTS.WEBHOOK_MAX_ATTEMPTS,
                        initialDelayMs: DEFAULTS.WEBHOOK_INITIAL_DELAY_MS,
                        maxDelayMs: DEFAULTS.WEBHOOK_HOOK_MAX_DELAY_MS,
                        backoffMultiplier: DEFAULTS.WEBHOOK_BACKOFF_MULTIPLIER,
                    },
                    enabled: true,
                };
                this.webhookRetryService.registerWebhook(config);
                this.registeredWebhooks.add(webhookId);
            }

            // Send via retry service
            await this.webhookRetryService.sendWebhook(webhookId, body, {
                headers,
                idempotencyKey: body.runId ? `${webhookId}-${body.runId}-${body.stage}` : undefined,
            });
        } else {
            // Fallback to simple fetch
            await this.simpleFetch(url, headers, body);
        }
    }

    /**
     * Generate a consistent webhook ID for registration
     */
    private getWebhookId(url: string, action: import('../../types').WebhookHookAction): string {
        const hash = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, DEFAULTS.WEBHOOK_ID_HASH_LENGTH);
        return `hook_${hash}`;
    }

    /**
     * Simple fetch fallback when WebhookRetryService is not available
     */
    private async simpleFetch(url: string, headers: Record<string, string> | undefined, body: JsonObject): Promise<void> {
        try {
            const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch;
            if (!fetchImpl) return;
            await fetchImpl(url, {
                method: 'POST',
                headers: { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...(headers ?? {}) },
                body: JSON.stringify(body ?? {}),
            });
        } catch (error) {
            this.logger.warn('Simple webhook fetch failed', {
                url,
                error: (error as Error)?.message,
            });
        }
    }

    /**
     * Get webhook delivery statistics
     */
    getWebhookStats(): { total: number; delivered: number; failed: number; retrying: number } | null {
        if (!this.webhookRetryService) return null;
        const stats = this.webhookRetryService.getStats();
        return {
            total: stats.total,
            delivered: stats.delivered,
            failed: stats.failed + stats.deadLetter,
            retrying: stats.retrying,
        };
    }
}
