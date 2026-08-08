import {
    Inject,
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type {
    ID,
    RequestContext,
} from '@vendure/core';
import type {
    DataHubPluginOptions,
    HookAction,
    HookExecutionResult,
    HookStageValue,
    InterceptorHookAction,
    InterceptorResult,
    JsonObject,
    PipelineDefinition,
    ScriptFunction,
    ScriptHookAction,
} from '../../types';
import {
    DATAHUB_PLUGIN_OPTIONS,
    HookActionType,
    LOGGER_CONTEXTS,
} from '../../constants';
import { getErrorMessage } from '../../utils/error.utils';
import {
    DataHubLogger,
    DataHubLoggerFactory,
} from '../logger';
import { DomainEventsService } from './domain-events.service';
import {
    HookActionExecutor,
    type HookActionContext,
} from './hook-action-executor';
import { HookInterceptorExecutor } from './hook-interceptor-executor';
import { HookScriptRegistryService } from './hook-script-registry.service';

@Injectable()
export class HookService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly actionExecutor: HookActionExecutor;
    private readonly interceptorExecutor: HookInterceptorExecutor;

    constructor(
        private moduleRef: ModuleRef,
        private domainEvents: DomainEventsService,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private scriptRegistry: HookScriptRegistryService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(
            LOGGER_CONTEXTS.HOOK_SERVICE,
        );
        this.actionExecutor = new HookActionExecutor(
            this.moduleRef,
            this.domainEvents,
            this.logger,
        );
        this.interceptorExecutor = new HookInterceptorExecutor(
            this.scriptRegistry,
            this.logger,
        );
    }

    registerScript(name: string, fn: ScriptFunction): void {
        if (this.scriptRegistry.register(name, fn)) {
            this.logger.warn(`Script "${name}" is being overwritten`);
        }
        this.logger.info(`Registered script: ${name}`);
    }

    getRegisteredScripts(): string[] {
        return this.scriptRegistry.names();
    }

    async onModuleInit(): Promise<void> {
        this.actionExecutor.initialize();
        this.logger.info(
            'WebhookRetryService connected for reliable webhook delivery',
        );

        if (this.options.scripts) {
            for (const [name, fn] of Object.entries(this.options.scripts)) {
                this.registerScript(name, fn);
            }
            this.logger.info(
                `Registered ${Object.keys(this.options.scripts).length} script(s) from plugin options`,
            );
        }
    }

    onModuleDestroy(): void {
        this.scriptRegistry.clear();
        this.interceptorExecutor.clear();
        this.actionExecutor.destroy();
    }

    async run(
        ctx: RequestContext,
        definition: PipelineDefinition,
        stage: HookStageValue,
        payload?: JsonObject | JsonObject[],
        record?: JsonObject,
        runId?: ID,
    ): Promise<HookExecutionResult> {
        const actions = (definition.hooks?.[stage] ?? []) as HookAction[];
        const context: HookActionContext = {
            ctx,
            stage,
            payload,
            record,
            runId,
        };
        const errors: HookExecutionResult['errors'] = [];
        let executed = 0;
        let skipped = 0;

        for (const [index, action] of actions.entries()) {
            const actionName =
                action.name?.trim() || `${action.type}:${index + 1}`;
            try {
                if (this.actionExecutor.supports(action.type)) {
                    await this.actionExecutor.execute(action, context);
                    executed += 1;
                } else {
                    skipped += 1;
                }
            } catch (error) {
                const message = getErrorMessage(error);
                errors.push({
                    action: actionName,
                    type: action.type,
                    error: message,
                });
                this.logger.warn('Hook action failed', {
                    stage,
                    actionType: action.type,
                    error: message,
                });
                if (action.failOnError === true) {
                    throw new Error(
                        `Hook action "${actionName}" failed: ${message}`,
                    );
                }
            }
        }

        const failed = errors.length;
        return {
            status: getExecutionStatus(
                actions.length,
                executed,
                failed,
            ),
            configured: actions.length,
            executed,
            skipped,
            failed,
            errors,
        };
    }

    async runTest(
        ctx: RequestContext,
        definition: PipelineDefinition,
        stage: HookStageValue,
        payload?: JsonObject | JsonObject[],
        pipelineId?: ID,
    ): Promise<HookExecutionResult> {
        const actions = (definition.hooks?.[stage] ?? []) as HookAction[];
        const interceptorActions = actions.filter(isTransformingAction);
        const observerActions = actions.filter(
            action => !isTransformingAction(action),
        );
        const errors: HookExecutionResult['errors'] = [];
        let executed = 0;
        let skipped = 0;

        if (interceptorActions.length > 0) {
            const interceptorDefinition = withStageActions(
                definition,
                stage,
                interceptorActions,
            );
            const interceptorResult = await this.runInterceptors(
                ctx,
                interceptorDefinition,
                stage,
                getTestRecords(payload),
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
            const observerDefinition = withStageActions(
                definition,
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
            status: getExecutionStatus(
                actions.length,
                executed,
                failed,
            ),
            configured: actions.length,
            executed,
            skipped,
            failed,
            errors,
        };
    }

    async runInterceptors(
        ctx: RequestContext,
        definition: PipelineDefinition,
        stage: HookStageValue,
        records: JsonObject[],
        runId?: ID,
        pipelineId?: ID,
    ): Promise<InterceptorResult> {
        const actions = (
            definition.hooks?.[stage] ?? []
        ) as HookAction[];
        const interceptorActions = actions.filter(isTransformingAction);
        if (interceptorActions.length === 0) {
            return {
                records,
                modified: false,
            };
        }

        const result = await this.interceptorExecutor.execute(
            interceptorActions,
            stage,
            records,
            runId,
            pipelineId,
        );
        await this.run(
            ctx,
            definition,
            stage,
            result.records,
            undefined,
            runId,
        );
        return result;
    }
}

function isTransformingAction(
    action: HookAction,
): action is InterceptorHookAction | ScriptHookAction {
    return action.type === HookActionType.INTERCEPTOR
        || action.type === HookActionType.SCRIPT;
}

function withStageActions(
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

function getTestRecords(
    payload?: JsonObject | JsonObject[],
): JsonObject[] {
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

function getExecutionStatus(
    configured: number,
    executed: number,
    failed: number,
): HookExecutionResult['status'] {
    if (configured === 0 || (executed === 0 && failed === 0)) {
        return 'SKIPPED';
    }
    if (failed === 0) {
        return 'EXECUTED';
    }
    if (executed === 0) {
        return 'FAILED';
    }
    return 'PARTIAL';
}
