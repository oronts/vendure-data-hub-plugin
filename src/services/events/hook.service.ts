import * as crypto from 'crypto';
import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
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
    WebhookHookAction,
    DataHubPluginOptions,
    LogLevel,
    HookExecutionResult,
} from '../../types/index';
import { DomainEventsService } from './domain-events.service';
import { ModuleRef } from '@nestjs/core';
import { PipelineService } from '../pipeline/pipeline.service';
import { WebhookRetryService, WebhookConfig } from '../webhooks/webhook-retry.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { DATAHUB_PLUGIN_OPTIONS, LOGGER_CONTEXTS, HOOK, WEBHOOK, TRUNCATION } from '../../constants/index';
import { HookActionType } from '../../constants/enums';
import { validateScriptBlock } from '../../utils/code-security.utils';
import { getErrorMessage } from '../../utils/error.utils';
import { validateUrlSafety } from '../../utils/url-security.utils';
import { assertWebhookHookSecurity } from '../validation/hook-security';
import { HookScriptRegistryService } from './hook-script-registry.service';

/** Context passed to action handlers during hook execution */
interface ActionHandlerContext {
    ctx: RequestContext;
    stage: HookStageValue;
    payload?: JsonObject | JsonObject[];
    record?: JsonObject;
    runId?: ID;
}

@Injectable()
export class HookService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private webhookRetryService: WebhookRetryService | null = null;
    /** Cache of compiled vm.Script instances keyed by wrapped code string */
    private scriptCache = new Map<string, Script>();

    /** Registry mapping hook action types to their handler functions */
    private readonly actionHandlers = new Map<string, (action: HookAction, handlerCtx: ActionHandlerContext) => Promise<void>>([
        [HookActionType.WEBHOOK, (action, handlerCtx) => this.handleWebhook(action as WebhookHookAction, handlerCtx)],
        [HookActionType.EMIT, (action, handlerCtx) => this.handleEmit(action, handlerCtx)],
        [HookActionType.TRIGGER_PIPELINE, (action, handlerCtx) => this.handleTriggerPipeline(action, handlerCtx)],
        [HookActionType.LOG, async (action, handlerCtx) => this.handleLog(action as LogHookAction, handlerCtx)],
    ]);

    constructor(
        private moduleRef: ModuleRef,
        private domainEvents: DomainEventsService,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private scriptRegistry: HookScriptRegistryService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.HOOK_SERVICE);
    }

    /**
     * Register a script function for use in script hooks
     */
    registerScript(name: string, fn: ScriptFunction): void {
        if (this.scriptRegistry.register(name, fn)) {
            this.logger.warn(`Script "${name}" is being overwritten`);
        }
        this.logger.info(`Registered script: ${name}`);
    }

    /**
     * Get all registered script names
     */
    getRegisteredScripts(): string[] {
        return this.scriptRegistry.names();
    }

    async onModuleInit() {
        this.webhookRetryService = this.moduleRef.get(WebhookRetryService, { strict: false });
        this.logger.info('WebhookRetryService connected for reliable webhook delivery');

        // Register scripts from plugin options
        if (this.options.scripts) {
            for (const [name, fn] of Object.entries(this.options.scripts)) {
                this.registerScript(name, fn);
            }
            this.logger.info(`Registered ${Object.keys(this.options.scripts).length} script(s) from plugin options`);
        }
    }

    onModuleDestroy() {
        this.scriptRegistry.clear();
        this.scriptCache.clear();
        this.webhookRetryService = null;
    }

    async run(
        ctx: RequestContext,
        def: PipelineDefinition,
        stage: HookStageValue,
        payload?: JsonObject | JsonObject[],
        record?: JsonObject,
        runId?: ID,
    ): Promise<HookExecutionResult> {
        const actions = (def.hooks?.[stage] ?? []) as HookAction[];
        const handlerCtx: ActionHandlerContext = { ctx, stage, payload, record, runId };
        const errors: HookExecutionResult['errors'] = [];
        let executed = 0;
        let skipped = 0;

        for (const [index, action] of actions.entries()) {
            const actionName = action.name?.trim() || `${action.type}:${index + 1}`;
            try {
                const handler = this.actionHandlers.get(action.type);
                if (handler) {
                    await handler(action, handlerCtx);
                    executed += 1;
                } else {
                    skipped += 1;
                }
            } catch (error) {
                const message = getErrorMessage(error);
                errors.push({ action: actionName, type: action.type, error: message });
                this.logger.warn('Hook action failed', {
                    stage,
                    actionType: action.type,
                    error: message,
                });
                if (action.failOnError === true) {
                    throw new Error(`Hook action "${actionName}" failed: ${message}`);
                }
            }
        }

        const failed = errors.length;
        const status = this.getExecutionStatus(actions.length, executed, failed);
        return {
            status,
            configured: actions.length,
            executed,
            skipped,
            failed,
            errors,
        };
    }

    async runTest(
        ctx: RequestContext,
        def: PipelineDefinition,
        stage: HookStageValue,
        payload?: JsonObject | JsonObject[],
        pipelineId?: ID,
    ): Promise<HookExecutionResult> {
        const actions = (def.hooks?.[stage] ?? []) as HookAction[];
        const interceptorActions = actions.filter(
            (action): action is InterceptorHookAction | ScriptHookAction =>
                action.type === HookActionType.INTERCEPTOR
                || action.type === HookActionType.SCRIPT,
        );
        const observerActions = actions.filter(
            action => action.type !== HookActionType.INTERCEPTOR
                && action.type !== HookActionType.SCRIPT,
        );
        const errors: HookExecutionResult['errors'] = [];
        let executed = 0;
        let skipped = 0;

        if (interceptorActions.length > 0) {
            const interceptorDefinition = this.withStageActions(
                def,
                stage,
                interceptorActions,
            );
            const interceptorResult = await this.runInterceptors(
                ctx,
                interceptorDefinition,
                stage,
                this.getTestRecords(payload),
                undefined,
                pipelineId,
            );
            const interceptorErrors = interceptorResult.errors ?? [];

            executed += interceptorActions.length - interceptorErrors.length;
            errors.push(...interceptorErrors.map((failure, index) => {
                const action = interceptorActions.find(candidate =>
                    (candidate.name || candidate.type) === failure.action,
                ) ?? interceptorActions[index];
                return {
                    action: failure.action,
                    type: action?.type ?? HookActionType.SCRIPT,
                    error: failure.error,
                };
            }));
        }

        if (observerActions.length > 0) {
            const observerDefinition = this.withStageActions(
                def,
                stage,
                observerActions,
            );
            const observerResult = await this.run(
                ctx,
                observerDefinition,
                stage,
                Array.isArray(payload) ? payload : undefined,
                Array.isArray(payload) ? undefined : payload,
            );
            executed += observerResult.executed;
            skipped += observerResult.skipped;
            errors.push(...observerResult.errors);
        }

        const failed = errors.length;
        return {
            status: this.getExecutionStatus(actions.length, executed, failed),
            configured: actions.length,
            executed,
            skipped,
            failed,
            errors,
        };
    }

    private withStageActions(
        definition: PipelineDefinition,
        stage: HookStageValue,
        actions: HookAction[],
    ): PipelineDefinition {
        return {
            ...definition,
            hooks: {
                ...definition.hooks,
                [stage]: actions,
            },
        };
    }

    private getTestRecords(payload?: JsonObject | JsonObject[]): JsonObject[] {
        if (Array.isArray(payload)) {
            return payload;
        }
        if (payload && Array.isArray(payload.records)) {
            return payload.records.filter(
                (record): record is JsonObject =>
                    record != null
                    && typeof record === 'object'
                    && !Array.isArray(record),
            );
        }
        return payload ? [payload] : [];
    }

    private getExecutionStatus(
        configured: number,
        executed: number,
        failed: number,
    ): HookExecutionResult['status'] {
        if (configured === 0 || (executed === 0 && failed === 0)) return 'SKIPPED';
        if (failed === 0) return 'EXECUTED';
        if (executed === 0) return 'FAILED';
        return 'PARTIAL';
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

                if (Array.isArray(result)) {
                    currentRecords = result;
                    hookContext.records = currentRecords;
                    modified = true;
                    this.logger.info(`Hook "${actionName}" executed`, {
                        stage,
                        type: action.type,
                        recordsIn: records.length,
                        recordsOut: result.length,
                        modified: true,
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

        // Validate script block before execution (allows braces/semicolons needed for JS code)
        validateScriptBlock(action.code);

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
                assign: (target: Record<string, unknown>, ...sources: Record<string, unknown>[]) => Object.assign({}, target, ...sources),
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
            // Intentional: creates new object identity for VM/sandbox isolation (structuredClone not available in VM context)
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

        // Compile (or retrieve from cache) and execute with vm.Script timeout (kills CPU-bound loops)
        let script = this.scriptCache.get(wrappedCode);
        if (!script) {
            this.logger.debug('Script cache miss, compiling new script', { cacheSize: this.scriptCache.size });
            if (this.scriptCache.size >= HOOK.MAX_SCRIPT_CACHE) {
                // FIFO eviction: removes oldest inserted entry (not LRU)
                const firstKey = this.scriptCache.keys().next().value!;
                this.scriptCache.delete(firstKey);
            }
            script = new Script(wrappedCode, { filename: 'hook-interceptor.js' });
            this.scriptCache.set(wrappedCode, script);
        } else {
            this.logger.debug('Script cache hit', { cacheSize: this.scriptCache.size });
        }

        // runInContext with timeout truly terminates CPU-bound code
        const vmResult = script.runInContext(safeContext, {
            timeout,
            breakOnSigint: true,
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const result = await Promise.race([
                vmResult,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Interceptor timeout after ${timeout}ms`)), timeout);
                }),
            ]);

            if (result !== undefined && !Array.isArray(result)) {
                throw new Error('Interceptor must return an array of records or undefined');
            }

            return result as JsonObject[] | undefined;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /**
     * Execute a registered script hook
     */
    private async executeScript(
        action: ScriptHookAction,
        records: JsonObject[],
        context: HookContext,
    ): Promise<JsonObject[] | undefined> {
        const scriptFn = this.scriptRegistry.get(action.scriptName);
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
            if (result !== undefined && !Array.isArray(result)) {
                throw new Error('Script must return an array of records or undefined');
            }
            return result;
        } finally {
            if (timerId !== undefined) {
                clearTimeout(timerId);
            }
        }
    }

    // ── Action handler methods (dispatched from actionHandlers registry) ──

    private async handleWebhook(action: WebhookHookAction, handlerCtx: ActionHandlerContext): Promise<void> {
        await this.callWebhook(action, {
            stage: handlerCtx.stage,
            payload: handlerCtx.payload ?? null,
            record: handlerCtx.record ?? null,
            runId: handlerCtx.runId?.toString() ?? null,
        }, handlerCtx.ctx);
    }

    private async handleEmit(action: HookAction, handlerCtx: ActionHandlerContext): Promise<void> {
        // HookAction with type EMIT has an `event` property
        const emitAction = action as HookAction & { event: string };
        this.domainEvents.publish(emitAction.event, {
            stage: handlerCtx.stage,
            payload: handlerCtx.payload,
            record: handlerCtx.record,
            runId: handlerCtx.runId,
        });
    }

    private async handleTriggerPipeline(action: HookAction, handlerCtx: ActionHandlerContext): Promise<void> {
        const triggerAction = action as Extract<HookAction, { type: 'TRIGGER_PIPELINE' }>;
        const pipelineService = this.moduleRef.get(PipelineService, { strict: false });
        if (!pipelineService) {
            throw new Error('Pipeline service is unavailable');
        }
        const seedRecords = Array.isArray(handlerCtx.payload)
            ? handlerCtx.payload
            : (handlerCtx.record ? [handlerCtx.record] : []);
        const run = await pipelineService.startRunByCode(handlerCtx.ctx, triggerAction.pipelineCode, {
            seedRecords,
            triggerKey: triggerAction.triggerKey,
            triggeredBy: `hook:${triggerAction.triggerKey}`,
        });
        this.logger.info('Pipeline triggered by hook', {
            pipelineCode: triggerAction.pipelineCode,
            childRunId: run.id,
            triggerKey: triggerAction.triggerKey,
            parentRunId: handlerCtx.runId,
            stage: handlerCtx.stage,
        });
    }

    private static readonly LOG_METHODS: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
        DEBUG: 'debug',
        INFO: 'info',
        WARN: 'warn',
        ERROR: 'error',
    };

    private handleLog(action: LogHookAction, handlerCtx: ActionHandlerContext): void {
        const level = action.level ?? 'INFO';
        const message = action.message ?? `Hook triggered: ${handlerCtx.stage}`;
        const logData = { stage: handlerCtx.stage, runId: handlerCtx.runId, payload: handlerCtx.payload ?? handlerCtx.record };
        const method = HookService.LOG_METHODS[level] ?? HookService.LOG_METHODS.INFO;
        if (method === 'error') {
            this.logger.error(message, undefined, logData);
        } else {
            this.logger[method](message, logData);
        }
    }

    // ── Webhook delivery ──

    /**
     * Call webhook with retry support if WebhookRetryService is available
     */
    private async callWebhook(
        action: HookAction,
        body: JsonObject,
        ctx: RequestContext,
    ): Promise<void> {
        if (action.type !== HookActionType.WEBHOOK) return;

        const webhookAction = action as WebhookHookAction;
        assertWebhookHookSecurity(webhookAction);
        const urlSafety = await validateUrlSafety(webhookAction.url);
        if (!urlSafety.safe) {
            throw new Error(`Webhook URL blocked by SSRF protection: ${urlSafety.reason ?? 'unknown reason'}`);
        }
        if (!this.webhookRetryService) {
            throw new Error('Webhook delivery service is unavailable');
        }

        const webhookId = this.getWebhookId(webhookAction.url, webhookAction);
        const config: WebhookConfig = {
            id: webhookId,
            url: webhookAction.url,
            method: 'POST',
            headers: { ...webhookAction.headers },
            secretCode: webhookAction.secretCode,
            headerSecretCodes: { ...webhookAction.headerSecretCodes },
            signatureHeader: webhookAction.signatureHeader,
            retryConfig: webhookAction.retryConfig ?? {
                maxAttempts: WEBHOOK.MAX_ATTEMPTS,
                initialDelayMs: WEBHOOK.INITIAL_DELAY_MS,
                maxDelayMs: WEBHOOK.HOOK_MAX_DELAY_MS,
                backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
            },
            enabled: true,
        };
        await this.webhookRetryService.sendWebhook(ctx, config, body, {
            idempotencyKey: body.runId
                ? `${webhookId}-${body.runId}-${body.stage}`
                : undefined,
        });
    }


    private getWebhookId(url: string, action: WebhookHookAction): string {
        const seed = JSON.stringify({
            url,
            secretCode: action.secretCode,
            headerSecretCodes: action.headerSecretCodes,
            signatureHeader: action.signatureHeader,
            retryConfig: action.retryConfig,
        });
        const hash = crypto.createHash('sha256')
            .update(seed)
            .digest('hex')
            .slice(0, TRUNCATION.WEBHOOK_ID_HASH_LENGTH);
        return `hook_${hash}`;
    }


}
