import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ID, RequestContext } from '@vendure/core';
import { createContext, Script } from 'vm';
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
import { LOGGER_CONTEXTS, HOOK, HTTP_HEADERS, CONTENT_TYPES, WEBHOOK, TRUNCATION } from '../../constants/index';
import { HookActionType } from '../../constants/enums';
import { validateUserCode } from '../../utils/code-security.utils';
import { getErrorMessage } from '../../utils/error.utils';
import { assertUrlSafe, validateUrlSafety } from '../../utils/url-security.utils';

/** Maximum number of registered webhook IDs to prevent unbounded memory growth */
const MAX_REGISTERED_WEBHOOKS = 1000;

@Injectable()
export class HookService implements OnModuleInit, OnModuleDestroy {
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

    onModuleDestroy() {
        this.registeredWebhooks.clear();
        this.registeredScripts.clear();
        this.webhookRetryService = null;
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
                    error: getErrorMessage(error),
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
                const errorMsg = getErrorMessage(error);
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
     *
     * Uses Node.js vm module with an isolated context to prevent:
     * - Prototype pollution (frozen safe copies of builtins, no prototype chain)
     * - CPU-bound infinite loops (vm timeout actually kills execution)
     */
    private async executeInterceptor(
        action: InterceptorHookAction,
        records: JsonObject[],
        context: HookContext,
    ): Promise<JsonObject[] | undefined> {
        const timeout = action.timeout ?? HOOK.INTERCEPTOR_TIMEOUT_MS;

        // Validate user code before execution
        validateUserCode(action.code);

        // Create an isolated context with no prototype chain
        const safeContext = createContext(Object.create(null), {
            codeGeneration: { strings: false, wasm: false },
        });

        // Add frozen, safe copies of builtins (prevents prototype mutation)
        const safeGlobals: Record<string, unknown> = {
            Math: Object.freeze({
                abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
                max: Math.max, min: Math.min, pow: Math.pow, sqrt: Math.sqrt,
                random: Math.random, sign: Math.sign, trunc: Math.trunc,
                PI: Math.PI, E: Math.E,
            }),
            Array: Object.freeze({
                from: Array.from.bind(Array), isArray: Array.isArray.bind(Array), of: Array.of.bind(Array),
            }),
            Object: Object.freeze({
                keys: Object.keys, values: Object.values, entries: Object.entries,
                assign: (target: any, ...sources: any[]) => Object.assign({}, target, ...sources),
                freeze: Object.freeze, fromEntries: Object.fromEntries,
            }),
            String: Object.freeze({ fromCharCode: String.fromCharCode }),
            Number: Object.freeze({
                isFinite: Number.isFinite, isInteger: Number.isInteger, isNaN: Number.isNaN,
                parseFloat, parseInt,
            }),
            JSON: Object.freeze({ parse: JSON.parse, stringify: JSON.stringify }),
            Date: Object.freeze({ now: Date.now.bind(Date), parse: Date.parse.bind(Date) }),
            isNaN,
            isFinite,
            encodeURIComponent,
            decodeURIComponent,
            console: Object.freeze({
                log: (...args: unknown[]) => this.logger.debug('Interceptor console.log', { consoleArgs: args }),
                warn: (...args: unknown[]) => this.logger.warn('Interceptor console.warn', { consoleArgs: args }),
                error: (...args: unknown[]) => this.logger.warn('Interceptor console.error', { consoleArgs: args }),
            }),
            // Provide records and context in scope for interceptor code
            records: JSON.parse(JSON.stringify(records)),
            context: JSON.parse(JSON.stringify(context)),
        };
        Object.assign(safeContext, safeGlobals);

        // Wrap user code in an async IIFE
        const wrappedCode = `
            "use strict";
            (async function() {
                ${action.code}
            })();
        `;

        // Compile and execute with vm.Script timeout (kills CPU-bound loops)
        const script = new Script(wrappedCode, {
            filename: 'hook-interceptor.js',
        });

        // runInContext with timeout truly terminates CPU-bound code
        const result = await script.runInContext(safeContext, {
            timeout,
            breakOnSigint: true,
        });

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

        // Execute with timeout, clearing the timer to prevent leaks
        let timerId: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timerId = setTimeout(() => reject(new Error(`Script timeout after ${timeout}ms`)), timeout);
        });
        try {
            const result = await Promise.race([
                Promise.resolve(scriptFn(records, context, action.args)),
                timeoutPromise,
            ]);
            return result;
        } finally {
            if (timerId !== undefined) {
                clearTimeout(timerId);
            }
        }
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

        // SSRF protection: validate webhook URL before making the request
        const urlSafety = await validateUrlSafety(url);
        if (!urlSafety.safe) {
            this.logger.warn('Webhook URL blocked by SSRF protection', {
                url,
                reason: urlSafety.reason,
            });
            return;
        }

        // Use WebhookRetryService for reliable delivery with retries
        if (this.webhookRetryService) {
            // Generate a unique webhook ID for this URL
            const webhookId = this.getWebhookId(url, webhookAction);

            // Register webhook config if not already registered
            if (!this.registeredWebhooks.has(webhookId)) {
                if (this.registeredWebhooks.size >= MAX_REGISTERED_WEBHOOKS) {
                    this.logger.debug('Registered webhooks cache full, clearing');
                    this.registeredWebhooks.clear();
                }
                const config: WebhookConfig = {
                    id: webhookId,
                    url,
                    method: 'POST',
                    headers,
                    secret: webhookAction.secret,
                    signatureHeader: webhookAction.signatureHeader,
                    retryConfig: webhookAction.retryConfig || {
                        maxAttempts: WEBHOOK.MAX_ATTEMPTS,
                        initialDelayMs: WEBHOOK.INITIAL_DELAY_MS,
                        maxDelayMs: WEBHOOK.HOOK_MAX_DELAY_MS,
                        backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
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
    private getWebhookId(url: string, _action: import('../../types').WebhookHookAction): string {
        const hash = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, TRUNCATION.WEBHOOK_ID_HASH_LENGTH);
        return `hook_${hash}`;
    }

    /**
     * Simple fetch fallback when WebhookRetryService is not available
     */
    private async simpleFetch(url: string, headers: Record<string, string> | undefined, body: JsonObject): Promise<void> {
        try {
            // SSRF protection: validate URL before making the request (defense-in-depth)
            await assertUrlSafe(url);

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
