import * as crypto from 'crypto';
import { ModuleRef } from '@nestjs/core';
import type { ID, RequestContext } from '@vendure/core';
import type {
    HookAction,
    HookStageValue,
    JsonObject,
    LogHookAction,
    LogLevel,
    WebhookHookAction,
} from '../../types';
import {
    HookActionType,
    TRUNCATION,
    WEBHOOK,
} from '../../constants';
import { validateUrlSafety } from '../../utils/url-security.utils';
import type { DataHubLogger } from '../logger';
import { PipelineService } from '../pipeline/pipeline.service';
import {
    WebhookRetryService,
    type WebhookConfig,
} from '../webhooks/webhook-retry.service';
import { assertWebhookHookSecurity } from '../validation/hook-security';
import type { DomainEventsService } from './domain-events.service';

export interface HookActionContext {
    ctx: RequestContext;
    stage: HookStageValue;
    payload?: JsonObject | JsonObject[];
    record?: JsonObject;
    runId?: ID;
}

type ActionHandler = (
    action: HookAction,
    context: HookActionContext,
) => Promise<void>;

const LOG_METHODS: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
};

export class HookActionExecutor {
    private readonly handlers: ReadonlyMap<string, ActionHandler>;
    private webhookRetryService: WebhookRetryService | null = null;

    constructor(
        private readonly moduleRef: ModuleRef,
        private readonly domainEvents: DomainEventsService,
        private readonly logger: DataHubLogger,
    ) {
        this.handlers = new Map<string, ActionHandler>([
            [
                HookActionType.WEBHOOK,
                (action, context) => this.handleWebhook(
                    action as WebhookHookAction,
                    context,
                ),
            ],
            [
                HookActionType.EMIT,
                (action, context) => this.handleEmit(action, context),
            ],
            [
                HookActionType.TRIGGER_PIPELINE,
                (action, context) => this.handleTriggerPipeline(action, context),
            ],
            [
                HookActionType.LOG,
                async (action, context) => this.handleLog(
                    action as LogHookAction,
                    context,
                ),
            ],
        ]);
    }

    initialize(): void {
        this.webhookRetryService = this.moduleRef.get(WebhookRetryService, {
            strict: false,
        });
    }

    destroy(): void {
        this.webhookRetryService = null;
    }

    supports(actionType: string): boolean {
        return this.handlers.has(actionType);
    }

    async execute(
        action: HookAction,
        context: HookActionContext,
    ): Promise<void> {
        const handler = this.handlers.get(action.type);
        if (handler) {
            await handler(action, context);
        }
    }

    private async handleWebhook(
        action: WebhookHookAction,
        context: HookActionContext,
    ): Promise<void> {
        await this.callWebhook(action, {
            stage: context.stage,
            payload: context.payload ?? null,
            record: context.record ?? null,
            runId: context.runId?.toString() ?? null,
        }, context.ctx);
    }

    private async handleEmit(
        action: HookAction,
        context: HookActionContext,
    ): Promise<void> {
        const emitAction = action as HookAction & { event: string };
        this.domainEvents.publish(emitAction.event, {
            stage: context.stage,
            payload: context.payload,
            record: context.record,
            runId: context.runId,
        });
    }

    private async handleTriggerPipeline(
        action: HookAction,
        context: HookActionContext,
    ): Promise<void> {
        const triggerAction = action as Extract<
            HookAction,
            { type: 'TRIGGER_PIPELINE' }
        >;
        const pipelineService = this.moduleRef.get(PipelineService, {
            strict: false,
        });
        if (!pipelineService) {
            throw new Error('Pipeline service is unavailable');
        }
        const seedRecords = Array.isArray(context.payload)
            ? context.payload
            : (context.record ? [context.record] : []);
        const run = await pipelineService.startRunByCode(
            context.ctx,
            triggerAction.pipelineCode,
            {
                seedRecords,
                triggerKey: triggerAction.triggerKey,
                skipPermissionCheck: true,
                triggeredBy: `hook:${triggerAction.triggerKey}`,
            },
        );
        this.logger.info('Pipeline triggered by hook', {
            pipelineCode: triggerAction.pipelineCode,
            childRunId: run.id,
            triggerKey: triggerAction.triggerKey,
            parentRunId: context.runId,
            stage: context.stage,
        });
    }

    private handleLog(
        action: LogHookAction,
        context: HookActionContext,
    ): void {
        const level = action.level ?? 'INFO';
        const message = action.message ?? `Hook triggered: ${context.stage}`;
        const logData = {
            stage: context.stage,
            runId: context.runId,
            payload: context.payload ?? context.record,
        };
        const method = LOG_METHODS[level] ?? LOG_METHODS.INFO;
        if (method === 'error') {
            this.logger.error(message, undefined, logData);
        } else {
            this.logger[method](message, logData);
        }
    }

    private async callWebhook(
        action: WebhookHookAction,
        body: JsonObject,
        ctx: RequestContext,
    ): Promise<void> {
        assertWebhookHookSecurity(action);
        const urlSafety = await validateUrlSafety(action.url);
        if (!urlSafety.safe) {
            throw new Error(
                `Webhook URL blocked by SSRF protection: ${urlSafety.reason ?? 'unknown reason'}`,
            );
        }
        if (!this.webhookRetryService) {
            throw new Error('Webhook delivery service is unavailable');
        }

        const webhookId = this.getWebhookId(action.url, action);
        const config: WebhookConfig = {
            id: webhookId,
            url: action.url,
            method: 'POST',
            headers: { ...action.headers },
            secretCode: action.secretCode,
            headerSecretCodes: { ...action.headerSecretCodes },
            signatureHeader: action.signatureHeader,
            retryConfig: action.retryConfig ?? {
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
