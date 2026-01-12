/**
 * DataHub Webhook Controller
 *
 * Handles incoming webhook requests to trigger pipelines.
 * Supports multiple authentication methods: API Key, HMAC, Basic, JWT.
 *
 * Security Features:
 * - Timing-safe comparison for all credential checks
 * - Rate limiting via RateLimitService
 * - Input validation on pipeline codes
 * - Secrets stored securely in database
 */

import { Body, Controller, HttpCode, HttpException, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { Pipeline } from '../../entities/pipeline';
import { PipelineService } from '../../services';
import { DataHubLoggerFactory, DataHubLogger } from '../../services/logger';
import { RateLimitService } from '../../services/rate-limit';
import { LOGGER_CONTEXTS } from '../../constants';
import * as crypto from 'crypto';
import { DataHubSecret } from '../../entities/config';
import { isValidPipelineCode } from '../../utils/input-validation.utils';

@Controller('data-hub/webhook')
export class DataHubWebhookController {
    private readonly logger: DataHubLogger;

    constructor(
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private pipelineService: PipelineService,
        private rateLimitService: RateLimitService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.WEBHOOK);
    }

    /**
     * Handle incoming webhook to trigger a pipeline
     *
     * @param code - Pipeline code to trigger
     * @param body - Webhook payload (records to process)
     * @param req - Raw request for header access
     */
    @Post(':code')
    @HttpCode(202)
    async handle(
        @Param('code') code: string,
        @Body() body: any,
        @Req() req: any,
    ): Promise<{ accepted: boolean }> {
        // Validate pipeline code format
        if (!code || !isValidPipelineCode(code)) {
            throw new HttpException('Invalid pipeline code format', HttpStatus.BAD_REQUEST);
        }

        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await repo.findOne({ where: { code } });

        if (!pipeline || !pipeline.enabled) {
            throw new HttpException('Pipeline not found or disabled', HttpStatus.NOT_FOUND);
        }

        // Only allow webhook triggers for PUBLISHED pipelines
        if ((pipeline as any).status !== 'PUBLISHED') {
            throw new HttpException('Pipeline must be published to receive webhook triggers', HttpStatus.BAD_REQUEST);
        }

        const trigger = pipeline.definition?.steps?.[0];
        const cfg: any = trigger?.config ?? {};

        if (trigger?.type !== 'TRIGGER' || (cfg.type && cfg.type !== 'webhook')) {
            throw new HttpException('Pipeline is not configured for webhook trigger', HttpStatus.BAD_REQUEST);
        }

        // Apply rate limiting from pipeline config (0 = unlimited)
        const configuredRateLimit = typeof cfg.rateLimit === 'number' ? cfg.rateLimit : 100;
        if (configuredRateLimit > 0) {
            const rateLimitResult = this.rateLimitService.isRateLimited(
                { ip, pipelineCode: code },
                configuredRateLimit,
                60000,
            );

            if (rateLimitResult.limited) {
                throw new HttpException('Too many webhook requests', HttpStatus.TOO_MANY_REQUESTS);
            }
        }

        // Enforce Idempotency-Key header if configured
        if (cfg.requireIdempotencyKey) {
            const idk = req.headers['x-idempotency-key'] as string | undefined;
            if (!idk) {
                throw new HttpException('Missing X-Idempotency-Key', HttpStatus.BAD_REQUEST);
            }
        }

        // Verify authentication based on configured type
        const authType = cfg.authentication || 'NONE';
        switch (authType) {
            case 'API_KEY':
                await this.verifyApiKey(ctx, req, cfg);
                break;
            case 'HMAC':
                await this.verifyHmacSignature(ctx, req, body, cfg);
                break;
            case 'BASIC':
                await this.verifyBasicAuth(ctx, req, cfg);
                break;
            case 'JWT':
                await this.verifyJwtAuth(ctx, req, cfg);
                break;
            case 'NONE':
                // No authentication - log warning for security audit
                this.logger.warn(`Webhook received without authentication for pipeline: ${code}`, {
                    ip,
                    pipelineCode: code,
                });
                break;
            default:
                throw new HttpException('Invalid authentication type', HttpStatus.BAD_REQUEST);
        }

        // Extract records from body
        const records: any[] = Array.isArray(body)
            ? body
            : (Array.isArray(body?.records) ? body.records : [body]);

        await this.pipelineService.startRunWithSeed(ctx, pipeline.id, records);

        this.logger.debug(`Webhook accepted for pipeline: ${code}`, {
            pipelineCode: code,
            recordCount: records.length,
            authType,
        });

        return { accepted: true };
    }

    /**
     * Verify API Key authentication with timing-safe comparison
     */
    private async verifyApiKey(
        ctx: any,
        req: any,
        cfg: any,
    ): Promise<void> {
        const headerName = (cfg.apiKeyHeaderName || 'x-api-key').toLowerCase();
        const apiKey = req.headers[headerName] as string | undefined;

        if (!apiKey) {
            throw new HttpException('Missing API key', HttpStatus.UNAUTHORIZED);
        }

        const secretCode = cfg.apiKeySecretCode as string | undefined;
        if (!secretCode) {
            throw new HttpException('API key secret code not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Get secret from database
        const sRepo = this.connection.getRepository(ctx, DataHubSecret as any);
        const s = await sRepo.findOne({ where: { code: secretCode } } as any);

        if (!s?.value) {
            throw new HttpException('API key not found', HttpStatus.UNAUTHORIZED);
        }

        // Extract the actual key (remove prefix if present)
        const prefix = cfg.apiKeyPrefix || '';
        const providedKey = apiKey.startsWith(prefix)
            ? apiKey.slice(prefix.length)
            : apiKey;

        // Use timing-safe comparison to prevent timing attacks
        if (!this.timingSafeCompare(s.value, providedKey)) {
            throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
        }
    }

    /**
     * Verify HMAC-SHA256 signature with timing-safe comparison
     */
    private async verifyHmacSignature(
        ctx: any,
        req: any,
        body: any,
        cfg: any,
    ): Promise<void> {
        const headerName = (cfg.hmacHeaderName as string | undefined) ?? 'x-datahub-signature';
        const sig = (req.headers[headerName.toLowerCase()] as string | undefined);

        if (!sig) {
            throw new HttpException('Missing signature', HttpStatus.UNAUTHORIZED);
        }

        const secretCode = cfg.secretCode as string | undefined;
        if (!secretCode) {
            throw new HttpException('HMAC secret code not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Get secret from database
        const sRepo = this.connection.getRepository(ctx, DataHubSecret as any);
        const s = await sRepo.findOne({ where: { code: secretCode } } as any);

        if (!s?.value) {
            throw new HttpException('HMAC secret not found', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const secret = s.value;
        const algorithm = (cfg.hmacAlgorithm as 'sha256' | 'sha512') || 'sha256';
        const expectedHash = crypto.createHmac(algorithm, secret)
            .update(JSON.stringify(body ?? {}))
            .digest('hex');

        // Use timing-safe comparison to prevent timing attacks
        if (!this.timingSafeCompare(expectedHash, sig)) {
            throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
        }
    }

    /**
     * Verify Basic authentication with timing-safe comparison
     */
    private async verifyBasicAuth(
        ctx: any,
        req: any,
        cfg: any,
    ): Promise<void> {
        const authHeader = req.headers['authorization'] as string | undefined;

        if (!authHeader) {
            throw new HttpException('Missing Authorization header', HttpStatus.UNAUTHORIZED);
        }

        if (!authHeader.startsWith('Basic ')) {
            throw new HttpException('Invalid Authorization header format', HttpStatus.UNAUTHORIZED);
        }

        const credentials = authHeader.slice(6);
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

        // Get secret from database (stored as username:password)
        const secretCode = cfg.basicSecretCode as string | undefined;
        if (!secretCode) {
            throw new HttpException('Basic auth secret code not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const sRepo = this.connection.getRepository(ctx, DataHubSecret as any);
        const s = await sRepo.findOne({ where: { code: secretCode } } as any);

        if (!s?.value) {
            throw new HttpException('Basic auth credentials not found', HttpStatus.UNAUTHORIZED);
        }

        // Use timing-safe comparison to prevent timing attacks
        if (!this.timingSafeCompare(s.value, decoded)) {
            throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
        }
    }

    /**
     * Verify JWT authentication using HMAC signature verification
     */
    private async verifyJwtAuth(
        ctx: any,
        req: any,
        cfg: any,
    ): Promise<void> {
        const headerName = (cfg.jwtHeaderName as string | undefined) || 'authorization';
        const authHeader = req.headers[headerName.toLowerCase()] as string | undefined;

        if (!authHeader) {
            throw new HttpException('Missing Authorization header', HttpStatus.UNAUTHORIZED);
        }

        // Expect 'Bearer <token>' format
        const parts = authHeader.split(' ');
        if (parts[0]?.toLowerCase() !== 'bearer' || !parts[1]) {
            throw new HttpException('Invalid Authorization header format', HttpStatus.UNAUTHORIZED);
        }

        const token = parts[1];

        // Get secret from database
        const secretCode = cfg.jwtSecretCode as string | undefined;
        if (!secretCode) {
            throw new HttpException('JWT secret code not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const sRepo = this.connection.getRepository(ctx, DataHubSecret as any);
        const s = await sRepo.findOne({ where: { code: secretCode } } as any);

        if (!s?.value) {
            throw new HttpException('JWT secret not found', HttpStatus.UNAUTHORIZED);
        }

        // Verify JWT using native crypto (HS256 only)
        const jwtParts = token.split('.');
        if (jwtParts.length !== 3) {
            throw new HttpException('Invalid JWT format', HttpStatus.UNAUTHORIZED);
        }

        const [headerB64, payloadB64, signatureB64] = jwtParts;

        // Verify signature
        const signingInput = `${headerB64}.${payloadB64}`;
        const expectedSignature = crypto
            .createHmac('sha256', s.value)
            .update(signingInput)
            .digest('base64url');

        if (!this.timingSafeCompare(expectedSignature, signatureB64)) {
            throw new HttpException('Invalid JWT signature', HttpStatus.UNAUTHORIZED);
        }

        // Decode and validate payload
        try {
            const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
            const payload = JSON.parse(payloadJson);

            // Check expiration
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                throw new HttpException('JWT has expired', HttpStatus.UNAUTHORIZED);
            }

            // Check not-before
            if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000)) {
                throw new HttpException('JWT is not yet valid', HttpStatus.UNAUTHORIZED);
            }
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Invalid JWT payload', HttpStatus.UNAUTHORIZED);
        }
    }

    /**
     * Perform timing-safe string comparison to prevent timing attacks
     */
    private timingSafeCompare(expected: string, provided: string): boolean {
        const expectedBuffer = Buffer.from(expected, 'utf8');
        const providedBuffer = Buffer.from(provided, 'utf8');

        // Ensure constant-time comparison regardless of length differences
        const maxLength = Math.max(expectedBuffer.length, providedBuffer.length);
        const paddedExpected = Buffer.alloc(maxLength);
        const paddedProvided = Buffer.alloc(maxLength);

        expectedBuffer.copy(paddedExpected);
        providedBuffer.copy(paddedProvided);

        // Compare padded buffers in constant time
        const match = crypto.timingSafeEqual(paddedExpected, paddedProvided);

        // Also verify lengths match (checked after constant-time comparison)
        return match && expectedBuffer.length === providedBuffer.length;
    }
}
