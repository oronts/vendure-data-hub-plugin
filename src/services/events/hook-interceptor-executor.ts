import type { ID } from '@vendure/core';
import {
    createContext,
    Script,
} from 'vm';
import type {
    HookContext,
    HookStageValue,
    InterceptorHookAction,
    InterceptorResult,
    JsonObject,
    ScriptHookAction,
} from '../../types';
import {
    HOOK,
    HookActionType,
} from '../../constants';
import { validateScriptBlock } from '../../utils/code-security.utils';
import { getErrorMessage } from '../../utils/error.utils';
import type { DataHubLogger } from '../logger';
import type { HookScriptRegistryService } from './hook-script-registry.service';

type TransformingHookAction = InterceptorHookAction | ScriptHookAction;

export class HookInterceptorExecutor {
    private readonly scriptCache = new Map<string, Script>();

    constructor(
        private readonly scriptRegistry: HookScriptRegistryService,
        private readonly logger: DataHubLogger,
    ) {}

    clear(): void {
        this.scriptCache.clear();
    }

    async execute(
        actions: readonly TransformingHookAction[],
        stage: HookStageValue,
        records: JsonObject[],
        runId?: ID,
        pipelineId?: ID,
    ): Promise<InterceptorResult> {
        let currentRecords = [...records];
        let modified = false;
        const errors: Array<{ action: string; error: string }> = [];
        const context: HookContext = {
            pipelineId: String(pipelineId ?? ''),
            runId: String(runId ?? ''),
            stage,
            records,
        };

        for (const action of actions) {
            const actionName = action.name || action.type;
            try {
                const result = action.type === HookActionType.INTERCEPTOR
                    ? await this.executeInterceptor(
                        action,
                        currentRecords,
                        context,
                    )
                    : await this.executeScript(
                        action,
                        currentRecords,
                        context,
                    );

                if (Array.isArray(result)) {
                    currentRecords = result;
                    context.records = currentRecords;
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
                const errorMessage = getErrorMessage(error);
                errors.push({
                    action: actionName,
                    error: errorMessage,
                });
                this.logger.warn(`Interceptor "${actionName}" failed`, {
                    stage,
                    error: errorMessage,
                    runId,
                });
                if (action.failOnError) {
                    throw new Error(
                        `Interceptor "${actionName}" failed: ${errorMessage}`,
                    );
                }
            }
        }

        return {
            records: currentRecords,
            modified,
            errors: errors.length > 0 ? errors : undefined,
        };
    }

    private async executeInterceptor(
        action: InterceptorHookAction,
        records: JsonObject[],
        context: HookContext,
    ): Promise<JsonObject[] | undefined> {
        const timeout = action.timeout ?? HOOK.INTERCEPTOR_TIMEOUT_MS;
        validateScriptBlock(action.code);

        const safeContext = createContext(Object.create(null), {
            codeGeneration: {
                strings: false,
                wasm: false,
            },
        });
        Object.assign(safeContext, this.createSafeGlobals(records, context));

        const wrappedCode = `
            "use strict";
            (async function() {
                ${action.code}
            })();
        `;
        const script = this.getScript(wrappedCode);
        const vmResult = script.runInContext(safeContext, {
            timeout,
            breakOnSigint: true,
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const result = await Promise.race([
                vmResult,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(
                            new Error(
                                `Interceptor timeout after ${timeout}ms`,
                            ),
                        ),
                        timeout,
                    );
                }),
            ]);

            if (result !== undefined && !Array.isArray(result)) {
                throw new Error(
                    'Interceptor must return an array of records or undefined',
                );
            }
            return result as JsonObject[] | undefined;
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    }

    private createSafeGlobals(
        records: JsonObject[],
        context: HookContext,
    ): Record<string, unknown> {
        return {
            Math: Object.freeze({
                abs: Math.abs,
                ceil: Math.ceil,
                floor: Math.floor,
                round: Math.round,
                max: Math.max,
                min: Math.min,
                pow: Math.pow,
                sqrt: Math.sqrt,
                random: Math.random,
                sign: Math.sign,
                trunc: Math.trunc,
                PI: Math.PI,
                E: Math.E,
            }),
            Array: Object.freeze({
                from: Array.from.bind(Array),
                isArray: Array.isArray.bind(Array),
                of: Array.of.bind(Array),
            }),
            Object: Object.freeze({
                keys: Object.keys,
                values: Object.values,
                entries: Object.entries,
                assign: (
                    target: Record<string, unknown>,
                    ...sources: Record<string, unknown>[]
                ) => Object.assign({}, target, ...sources),
                freeze: Object.freeze,
                fromEntries: Object.fromEntries,
            }),
            String: Object.freeze({
                fromCharCode: String.fromCharCode,
            }),
            Number: Object.freeze({
                isFinite: Number.isFinite,
                isInteger: Number.isInteger,
                isNaN: Number.isNaN,
                parseFloat,
                parseInt,
            }),
            JSON: Object.freeze({
                parse: JSON.parse,
                stringify: JSON.stringify,
            }),
            Date: Object.freeze({
                now: Date.now.bind(Date),
                parse: Date.parse.bind(Date),
            }),
            isNaN,
            isFinite,
            encodeURIComponent,
            decodeURIComponent,
            console: Object.freeze({
                log: (...args: unknown[]) => this.logger.debug(
                    'Interceptor console.log',
                    { consoleArgs: args },
                ),
                warn: (...args: unknown[]) => this.logger.warn(
                    'Interceptor console.warn',
                    { consoleArgs: args },
                ),
                error: (...args: unknown[]) => this.logger.warn(
                    'Interceptor console.error',
                    { consoleArgs: args },
                ),
            }),
            // VM records must not retain references to host pipeline records.
            records: JSON.parse(JSON.stringify(records)),
            context: JSON.parse(JSON.stringify(context)),
        };
    }

    private getScript(wrappedCode: string): Script {
        const cached = this.scriptCache.get(wrappedCode);
        if (cached) {
            this.logger.debug('Script cache hit', {
                cacheSize: this.scriptCache.size,
            });
            return cached;
        }

        this.logger.debug('Script cache miss, compiling new script', {
            cacheSize: this.scriptCache.size,
        });
        if (this.scriptCache.size >= HOOK.MAX_SCRIPT_CACHE) {
            const firstKey = this.scriptCache.keys().next().value!;
            this.scriptCache.delete(firstKey);
        }
        const script = new Script(wrappedCode, {
            filename: 'hook-interceptor.js',
        });
        this.scriptCache.set(wrappedCode, script);
        return script;
    }

    private async executeScript(
        action: ScriptHookAction,
        records: JsonObject[],
        context: HookContext,
    ): Promise<JsonObject[] | undefined> {
        const script = this.scriptRegistry.get(action.scriptName);
        if (!script) {
            throw new Error(
                `Script "${action.scriptName}" is not registered`,
            );
        }

        const timeout = action.timeout ?? HOOK.INTERCEPTOR_TIMEOUT_MS;
        let timer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`Script timeout after ${timeout}ms`)),
                timeout,
            );
        });
        try {
            const result = await Promise.race([
                Promise.resolve(script(records, context, action.args)),
                timeoutPromise,
            ]);
            if (result !== undefined && !Array.isArray(result)) {
                throw new Error(
                    'Script must return an array of records or undefined',
                );
            }
            return result;
        } finally {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        }
    }
}
