import { Body, Controller, HttpCode, HttpException, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import type { Request } from 'express';
import * as crypto from 'crypto';
import type { PipelineTrigger, PipelineDefinition, JsonValue } from '../../types/index';
import { LOGGER_CONTEXTS, WEBHOOK } from '../../constants';
import { TriggerType as TriggerTypeEnum } from '../../constants/enums';
import { ConnectionAuthType } from '../../../shared/types/adapter-config.types';
import { PipelineService } from '../../services';
import { SecretService } from '../../services/config/secret.service';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { DataHubLoggerFactory, DataHubLogger } from '../../services/logger';
import {
    RateLimitBackendUnavailableError,
    RateLimitKey,
    RateLimitService,
} from '../../services/rate-limit';
import { isValidPipelineCode, findEnabledTriggersByType } from '../../utils';
import { PipelineRunIdempotencyConflictError } from '../../services/pipeline/pipeline-run-idempotency';
import { getNestedValue } from '../../../shared/utils/object-path';
import { loadRunnablePipelineDefinitionByCode } from '../../services/pipeline/active-pipeline-definitions';
import { PipelineRevisionMismatchError } from '../../services/pipeline/pipeline-policy';

import {
    resolveIncomingWebhookIdempotency,
    resolveIncomingWebhookRateLimit,
} from './webhook-request.utils';
import { IncomingWebhookAuthenticator } from './webhook-authentication';

@Controller('data-hub/webhook')
export class DataHubWebhookController {
    private readonly logger: DataHubLogger;
    private readonly authenticator: IncomingWebhookAuthenticator;

    constructor(
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private pipelineService: PipelineService,
        secretService: SecretService,
        private domainEvents: DomainEventsService,
        private rateLimitService: RateLimitService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.WEBHOOK);
        this.authenticator = new IncomingWebhookAuthenticator(secretService);
    }

    @Post(':code')
    @HttpCode(202)
    async handle(
        @Param('code') code: string,
        @Body() body: Record<string, unknown> | unknown[],
        @Req() req: Request,
    ): Promise<{ accepted: true; duplicate: boolean; runId: string }> {
        if (!code || !isValidPipelineCode(code)) {
            throw new HttpException('Invalid pipeline code format', HttpStatus.BAD_REQUEST);
        }

        const ip = req.ip ||
            (req as Request & { connection?: { remoteAddress?: string } })
                .connection?.remoteAddress ||
            'unknown';
        await this.enforceRateLimit(
            { ip, identifier: 'webhook-pre-auth' },
            WEBHOOK.PRE_AUTH_RATE_LIMIT_REQUESTS,
            WEBHOOK.PRE_AUTH_RATE_LIMIT_WINDOW_MS,
        );

        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
        const bodySize = rawBody ? rawBody.length : Buffer.byteLength(JSON.stringify(body ?? {}));
        if (bodySize > WEBHOOK.MAX_PAYLOAD_SIZE) {
            throw new HttpException('Payload too large', HttpStatus.PAYLOAD_TOO_LARGE);
        }

        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        const pipeline = await loadRunnablePipelineDefinitionByCode(
            this.connection,
            ctx,
            code,
        );

        if (!pipeline) {
            throw new HttpException('Pipeline not found or disabled', HttpStatus.NOT_FOUND);
        }

        // Find ALL enabled webhook triggers - supports multiple webhooks per pipeline
        const definition = pipeline.definition as PipelineDefinition | undefined;
        const webhookTriggers = findEnabledTriggersByType(definition, TriggerTypeEnum.WEBHOOK);

        if (webhookTriggers.length === 0) {
            throw new HttpException('Pipeline is not configured for webhook trigger', HttpStatus.BAD_REQUEST);
        }

        // Separate authenticated and unauthenticated triggers
        const authenticatedTriggers: typeof webhookTriggers = [];
        const noneTriggers: typeof webhookTriggers = [];
        for (const trigger of webhookTriggers) {
            const cfg = (trigger.config ?? {}) as unknown as Partial<PipelineTrigger>;
            if (this.authenticator.resolveType(cfg) === ConnectionAuthType.NONE) {
                noneTriggers.push(trigger);
            } else {
                authenticatedTriggers.push(trigger);
            }
        }

        // If any trigger requires auth, NONE triggers are not tried (prevents bypass)
        const triggersToTry = authenticatedTriggers.length > 0 ? authenticatedTriggers : noneTriggers;

        let authenticatedTrigger: typeof webhookTriggers[0] | null = null;
        let lastAuthError: HttpException | null = null;

        for (const trigger of triggersToTry) {
            const cfg = (trigger.config ?? {}) as unknown as Partial<PipelineTrigger>;
            const authType = this.authenticator.resolveType(cfg);

            try {
                await this.authenticator.authenticate(ctx, req, cfg);
                authenticatedTrigger = trigger;
                if (authType === ConnectionAuthType.NONE) {
                    this.logger.error(
                        `SECURITY: Webhook received WITHOUT authentication for pipeline: ${code}. ` +
                        `Configure authentication (api-key, hmac, basic, or jwt) to secure this endpoint.`,
                        undefined,
                        {
                            ip,
                            pipelineCode: code,
                            triggerKey: trigger.key,
                            severity: 'security',
                        },
                    );
                }
                break;
            } catch (error) {
                if (error instanceof HttpException) {
                    lastAuthError = error;
                    continue;
                }
                throw error;
            }
        }

        if (!authenticatedTrigger) {
            // All webhook triggers failed auth - throw the last error
            throw lastAuthError ?? new HttpException('Authentication failed', HttpStatus.UNAUTHORIZED);
        }

        const cfg = (authenticatedTrigger.config ?? {}) as unknown as Partial<PipelineTrigger>;

        const rateLimit = resolveIncomingWebhookRateLimit(cfg);
        if (rateLimit.maxRequests > 0) {
            await this.enforceRateLimit(
                { ip, pipelineCode: code },
                rateLimit.maxRequests,
                rateLimit.windowMs,
            );
        }

        const idempotency = resolveIncomingWebhookIdempotency(req.headers, cfg);
        const authType = this.authenticator.resolveType(cfg);
        const records: JsonValue[] = this.extractRecordsFromBody(body, definition);
        const runOptions = {
            triggerKey: authenticatedTrigger.key,
            skipPermissionCheck: true,
            triggeredBy: `webhook:${authenticatedTrigger.key}`,
            expectedRevisionId: pipeline.revisionId,
        };
        let runResult: { run: { id: unknown }; duplicate: boolean };
        try {
            runResult = idempotency
                ? await this.pipelineService.startIdempotentRunWithSeed(
                    ctx,
                    pipeline.id,
                    records,
                    {
                        ...runOptions,
                        idempotencyKey: idempotency.key,
                        idempotencyTtlSeconds: idempotency.ttlSeconds,
                        requestFingerprint: crypto.createHash('sha256')
                            .update(rawBody ?? Buffer.from(JSON.stringify(body ?? {})))
                            .digest('hex'),
                    },
                )
                : {
                    run: await this.pipelineService.startRunWithSeed(
                        ctx,
                        pipeline.id,
                        records,
                        runOptions,
                    ),
                    duplicate: false,
                };
        } catch (error) {
            if (error instanceof PipelineRunIdempotencyConflictError) {
                throw new HttpException(error.message, HttpStatus.CONFLICT);
            }
            if (error instanceof PipelineRevisionMismatchError) {
                throw new HttpException(
                    'Pipeline publication changed during webhook processing; retry the request',
                    HttpStatus.CONFLICT,
                );
            }
            throw error;
        }

        if (!runResult.duplicate) {
            this.domainEvents.publishTriggerFired(
                String(pipeline.id),
                'WEBHOOK',
                { pipelineCode: code, triggerKey: authenticatedTrigger.key, recordCount: records.length },
            );
        }

        this.logger.debug(`Webhook ${runResult.duplicate ? 'duplicate' : 'accepted'} for pipeline: ${code}`, {
            pipelineCode: code,
            triggerKey: authenticatedTrigger.key,
            recordCount: records.length,
            authType,
            duplicate: runResult.duplicate,
            runId: runResult.run.id,
        });

        return {
            accepted: true,
            duplicate: runResult.duplicate,
            runId: String(runResult.run.id),
        };
    }

    private async enforceRateLimit(
        key: RateLimitKey,
        maxRequests: number,
        windowMs: number,
    ): Promise<void> {
        try {
            const result = await this.rateLimitService.isRateLimited(
                key,
                maxRequests,
                windowMs,
            );
            if (result.limited) {
                throw new HttpException('Too many webhook requests', HttpStatus.TOO_MANY_REQUESTS);
            }
        } catch (error) {
            if (!(error instanceof RateLimitBackendUnavailableError)) {
                throw error;
            }
            this.logger.error(
                'Webhook admission rejected because the distributed rate limiter is unavailable',
            );
            throw new HttpException(
                'Webhook admission is temporarily unavailable',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }

    /**
     * Extracts records from a webhook body using the extract step's canonical dataPath.
     */
    private extractRecordsFromBody(
        body: Record<string, unknown> | unknown[],
        definition?: PipelineDefinition,
    ): JsonValue[] {
        if (Array.isArray(body)) {
            return body as JsonValue[];
        }

        // Webhook payload unwrapping follows the same path contract as HTTP extraction.
        const extractStep = definition?.steps?.find(
            s => s.type === 'EXTRACT' && (s.config as Record<string, unknown>)?.dataPath,
        );
        if (extractStep) {
            const dataPath = (extractStep.config as Record<string, unknown>).dataPath as string;
            const items = getNestedValue(body as Record<string, unknown>, dataPath);
            if (Array.isArray(items)) {
                return items as JsonValue[];
            }
        }

        // Fallback: check for 'records' key (convention)
        if (Array.isArray((body as Record<string, unknown>)?.records)) {
            return (body as Record<string, unknown>).records as JsonValue[];
        }

        return [body as JsonValue];
    }

}
