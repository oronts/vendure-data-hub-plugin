import { Body, Controller, HttpCode, HttpException, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import type { Request } from 'express';
import * as crypto from 'crypto';
import type { PipelineTrigger, PipelineDefinition, JsonValue } from '../../types/index';
import { LOGGER_CONTEXTS, INTERNAL_TIMINGS, PipelineStatus, WEBHOOK, DEFAULT_WEBHOOK_CONFIG, AUTH_SCHEMES, TIME } from '../../constants';
import { TriggerType as TriggerTypeEnum } from '../../constants/enums';
import { ConnectionAuthType } from '../../../shared/types/adapter-config.types';
import { Pipeline } from '../../entities/pipeline';
import { PipelineService } from '../../services';
import { SecretService } from '../../services/config/secret.service';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { DataHubLoggerFactory, DataHubLogger } from '../../services/logger';
import { RateLimitService } from '../../services/rate-limit';
import { isValidPipelineCode, findEnabledTriggersByType } from '../../utils';

@Controller('data-hub/webhook')
export class DataHubWebhookController {
    private readonly logger: DataHubLogger;

    private readonly authStrategies: Record<string, (
        ctx: RequestContext,
        req: Request,
        body: Record<string, unknown> | unknown[],
        cfg: Partial<PipelineTrigger>,
    ) => Promise<void>> = {
        [ConnectionAuthType.API_KEY]: (ctx, req, _body, cfg) => this.verifyApiKey(ctx, req, cfg),
        [ConnectionAuthType.HMAC]: (ctx, req, body, cfg) => this.verifyHmacSignature(ctx, req, body, cfg),
        [ConnectionAuthType.BASIC]: (ctx, req, _body, cfg) => this.verifyBasicAuth(ctx, req, cfg),
        [ConnectionAuthType.JWT]: (ctx, req, _body, cfg) => this.verifyJwtAuth(ctx, req, cfg),
    };

    constructor(
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private pipelineService: PipelineService,
        private secretService: SecretService,
        private domainEvents: DomainEventsService,
        private rateLimitService: RateLimitService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.WEBHOOK);
    }

    @Post(':code')
    @HttpCode(202)
    async handle(
        @Param('code') code: string,
        @Body() body: Record<string, unknown> | unknown[],
        @Req() req: Request,
    ): Promise<{ accepted: boolean }> {
        if (!code || !isValidPipelineCode(code)) {
            throw new HttpException('Invalid pipeline code format', HttpStatus.BAD_REQUEST);
        }

        const ip = req.ip || (req as Request & { connection?: { remoteAddress?: string } }).connection?.remoteAddress || 'unknown';
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await repo.findOne({ where: { code } });

        if (!pipeline || !pipeline.enabled) {
            throw new HttpException('Pipeline not found or disabled', HttpStatus.NOT_FOUND);
        }

        if (pipeline.status !== PipelineStatus.PUBLISHED) {
            throw new HttpException('Pipeline must be published to receive webhook triggers', HttpStatus.BAD_REQUEST);
        }

        // Find ALL enabled webhook triggers - supports multiple webhooks per pipeline
        const definition = pipeline.definition as PipelineDefinition | undefined;
        const webhookTriggers = findEnabledTriggersByType(definition, TriggerTypeEnum.WEBHOOK);

        if (webhookTriggers.length === 0) {
            throw new HttpException('Pipeline is not configured for webhook trigger', HttpStatus.BAD_REQUEST);
        }

        // Try to authenticate against each webhook trigger
        // First successful auth wins and that trigger's config is used
        let authenticatedTrigger: typeof webhookTriggers[0] | null = null;
        let lastAuthError: HttpException | null = null;

        for (const trigger of webhookTriggers) {
            const cfg = (trigger.config ?? {}) as unknown as Partial<PipelineTrigger>;
            const authType = cfg.authentication || ConnectionAuthType.NONE;

            try {
                const strategy = this.authStrategies[authType];
                if (strategy) {
                    await strategy(ctx, req, body, cfg);
                } else if (authType !== ConnectionAuthType.NONE) {
                    throw new HttpException('Invalid authentication type', HttpStatus.BAD_REQUEST);
                }
                // Auth passed - use this trigger
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
                    // Continue to try next webhook trigger
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

        const configuredRateLimit = typeof cfg.rateLimit === 'number' ? cfg.rateLimit : INTERNAL_TIMINGS.DEFAULT_WEBHOOK_RATE_LIMIT;
        if (configuredRateLimit > 0) {
            const rateLimitResult = this.rateLimitService.isRateLimited(
                { ip, pipelineCode: code },
                configuredRateLimit,
                INTERNAL_TIMINGS.DEFAULT_RATE_LIMIT_WINDOW_MS,
            );

            if (rateLimitResult.limited) {
                throw new HttpException('Too many webhook requests', HttpStatus.TOO_MANY_REQUESTS);
            }
        }

        if (cfg.requireIdempotencyKey) {
            const idk = req.headers['x-idempotency-key'] as string | undefined;
            if (!idk) {
                throw new HttpException('Missing X-Idempotency-Key', HttpStatus.BAD_REQUEST);
            }
        }

        const authType = cfg.authentication || ConnectionAuthType.NONE;

        const records: JsonValue[] = Array.isArray(body)
            ? (body as JsonValue[])
            : (Array.isArray((body as Record<string, unknown>)?.records)
                ? ((body as Record<string, unknown>).records as JsonValue[])
                : [body as JsonValue]);

        await this.pipelineService.startRunWithSeed(ctx, pipeline.id, records, {
            skipPermissionCheck: true,
            triggeredBy: `webhook:${authenticatedTrigger.key}`,
        });

        this.domainEvents.publishTriggerFired(
            String(pipeline.id),
            'WEBHOOK',
            { pipelineCode: code, triggerKey: authenticatedTrigger.key, recordCount: records.length },
        );

        this.logger.debug(`Webhook accepted for pipeline: ${code}`, {
            pipelineCode: code,
            triggerKey: authenticatedTrigger.key,
            recordCount: records.length,
            authType,
        });

        return { accepted: true };
    }

    private async verifyApiKey(
        ctx: RequestContext,
        req: Request,
        cfg: Partial<PipelineTrigger>,
    ): Promise<void> {
        const headerName = (cfg.apiKeyHeaderName ?? DEFAULT_WEBHOOK_CONFIG.apiKeyHeaderName!).toLowerCase();
        const apiKey = req.headers[headerName] as string | undefined;

        if (!apiKey) {
            throw new HttpException('Missing API key', HttpStatus.UNAUTHORIZED);
        }

        if (apiKey.length > WEBHOOK.MAX_API_KEY_LENGTH) {
            throw new HttpException('Invalid API key format', HttpStatus.BAD_REQUEST);
        }

        const secretCode = cfg.apiKeySecretCode;
        if (!secretCode) {
            throw new HttpException('API key secret code not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const secretValue = await this.secretService.resolve(ctx, secretCode);

        if (!secretValue) {
            throw new HttpException('API key not found', HttpStatus.UNAUTHORIZED);
        }

        const prefix = cfg.apiKeyPrefix ?? '';
        const providedKey = apiKey.startsWith(prefix)
            ? apiKey.slice(prefix.length)
            : apiKey;

        if (!this.timingSafeCompare(secretValue, providedKey)) {
            throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
        }
    }

    private async verifyHmacSignature(
        ctx: RequestContext,
        req: Request,
        body: Record<string, unknown> | unknown[],
        cfg: Partial<PipelineTrigger>,
    ): Promise<void> {
        const headerName = cfg.hmacHeaderName ?? DEFAULT_WEBHOOK_CONFIG.hmacHeaderName!;
        const sig = (req.headers[headerName.toLowerCase()] as string | undefined);

        if (!sig) {
            throw new HttpException('Missing signature', HttpStatus.UNAUTHORIZED);
        }

        if (sig.length > WEBHOOK.MAX_SIGNATURE_LENGTH) {
            throw new HttpException('Invalid signature format', HttpStatus.BAD_REQUEST);
        }

        const secretCode = cfg.secretCode;
        if (!secretCode) {
            throw new HttpException('HMAC secret code not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const secretValue = await this.secretService.resolve(ctx, secretCode);

        if (!secretValue) {
            throw new HttpException('HMAC secret not found', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const algorithm = cfg.hmacAlgorithm?.toLowerCase() ?? 'sha256';
        if (!WEBHOOK.ALLOWED_HMAC_ALGORITHMS.includes(algorithm)) {
            throw new HttpException('Unsupported HMAC algorithm', HttpStatus.BAD_REQUEST);
        }
        const expectedHash = crypto.createHmac(algorithm, secretValue)
            .update(JSON.stringify(body ?? {}))
            .digest('hex');

        if (!this.timingSafeCompare(expectedHash, sig)) {
            throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
        }
    }

    private async verifyBasicAuth(
        ctx: RequestContext,
        req: Request,
        cfg: Partial<PipelineTrigger>,
    ): Promise<void> {
        const authHeader = req.headers['authorization'] as string | undefined;

        if (!authHeader) {
            throw new HttpException('Missing Authorization header', HttpStatus.UNAUTHORIZED);
        }

        const basicPrefix = `${AUTH_SCHEMES.BASIC} `;
        if (!authHeader.startsWith(basicPrefix)) {
            throw new HttpException('Invalid Authorization header format', HttpStatus.UNAUTHORIZED);
        }

        const credentials = authHeader.slice(basicPrefix.length);
        let decoded: string;
        try {
            decoded = Buffer.from(credentials, 'base64').toString('utf8');
        } catch {
            throw new HttpException('Invalid credentials encoding', HttpStatus.UNAUTHORIZED);
        }

        const colonIndex = decoded.indexOf(':');
        if (colonIndex === -1) {
            throw new HttpException('Invalid credentials format', HttpStatus.UNAUTHORIZED);
        }

        const username = decoded.slice(0, colonIndex);
        const password = decoded.slice(colonIndex + 1);

        if (!username || !password) {
            throw new HttpException('Invalid credentials format', HttpStatus.UNAUTHORIZED);
        }

        const secretCode = cfg.basicSecretCode;
        if (!secretCode) {
            throw new HttpException('Basic auth secret code not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const secretValue = await this.secretService.resolve(ctx, secretCode);

        if (!secretValue) {
            throw new HttpException('Basic auth credentials not found', HttpStatus.UNAUTHORIZED);
        }

        if (!this.timingSafeCompare(secretValue, decoded)) {
            throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
        }
    }

    private async verifyJwtAuth(
        ctx: RequestContext,
        req: Request,
        cfg: Partial<PipelineTrigger>,
    ): Promise<void> {
        const headerName = cfg.jwtHeaderName ?? DEFAULT_WEBHOOK_CONFIG.jwtHeaderName!;
        const authHeader = req.headers[headerName.toLowerCase()] as string | undefined;

        if (!authHeader) {
            throw new HttpException('Missing Authorization header', HttpStatus.UNAUTHORIZED);
        }

        if (authHeader.length > WEBHOOK.MAX_AUTH_HEADER_LENGTH) {
            throw new HttpException('Authorization header too large', HttpStatus.BAD_REQUEST);
        }

        const parts = authHeader.split(' ');
        if (parts[0]?.toLowerCase() !== AUTH_SCHEMES.BEARER.toLowerCase() || !parts[1]) {
            throw new HttpException('Invalid Authorization header format', HttpStatus.UNAUTHORIZED);
        }

        const token = parts[1];

        const secretCode = cfg.jwtSecretCode;
        if (!secretCode) {
            throw new HttpException('JWT secret code not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const secretValue = await this.secretService.resolve(ctx, secretCode);

        if (!secretValue) {
            throw new HttpException('JWT secret not found', HttpStatus.UNAUTHORIZED);
        }

        const jwtParts = token.split('.');
        if (jwtParts.length !== WEBHOOK.JWT_PARTS_COUNT) {
            throw new HttpException('Invalid JWT format', HttpStatus.UNAUTHORIZED);
        }

        const [headerB64, payloadB64, signatureB64] = jwtParts;

        // Validate JWT algorithm header to prevent alg:none and other attacks
        try {
            const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8');
            const header = JSON.parse(headerJson);
            if (header.alg !== WEBHOOK.REQUIRED_JWT_ALGORITHM) {
                throw new HttpException(
                    `Unsupported JWT algorithm: '${header.alg}'. Only HS256 is accepted.`,
                    HttpStatus.UNAUTHORIZED,
                );
            }
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Invalid JWT header', HttpStatus.UNAUTHORIZED);
        }

        const signingInput = `${headerB64}.${payloadB64}`;
        const expectedSignature = crypto
            .createHmac('sha256', secretValue)
            .update(signingInput)
            .digest('base64url');

        if (!this.timingSafeCompare(expectedSignature, signatureB64)) {
            throw new HttpException('Invalid JWT signature', HttpStatus.UNAUTHORIZED);
        }

        try {
            const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
            const payload = JSON.parse(payloadJson);

            const nowUnix = Math.floor(Date.now() / TIME.SECOND);
            if (payload.exp && payload.exp < nowUnix) {
                throw new HttpException('JWT has expired', HttpStatus.UNAUTHORIZED);
            }

            if (payload.nbf && payload.nbf > nowUnix) {
                throw new HttpException('JWT is not yet valid', HttpStatus.UNAUTHORIZED);
            }
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Invalid JWT payload', HttpStatus.UNAUTHORIZED);
        }
    }

    private timingSafeCompare(expected: string, provided: string): boolean {
        const expectedBuffer = Buffer.from(expected, 'utf8');
        const providedBuffer = Buffer.from(provided, 'utf8');

        const maxLength = Math.max(expectedBuffer.length, providedBuffer.length);
        const paddedExpected = Buffer.alloc(maxLength);
        const paddedProvided = Buffer.alloc(maxLength);

        expectedBuffer.copy(paddedExpected);
        providedBuffer.copy(paddedProvided);

        const match = crypto.timingSafeEqual(paddedExpected, paddedProvided);

        return match && expectedBuffer.length === providedBuffer.length;
    }
}
