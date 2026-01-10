/**
 * DataHub Webhook Controller
 *
 * Handles incoming webhook requests to trigger pipelines.
 * Supports HMAC signature verification for secure webhook delivery.
 */

import { Body, Controller, HttpCode, HttpException, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { Pipeline } from '../../entities/pipeline';
import { PipelineService } from '../../services';
import * as crypto from 'crypto';
import { DataHubSecret } from '../../entities/config';

@Controller('data-hub/webhook')
export class DataHubWebhookController {
    constructor(
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private pipelineService: PipelineService,
    ) {}

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

        // Enforce Idempotency-Key header if declared
        if (cfg.requireIdempotencyKey) {
            const idk = req.headers['x-idempotency-key'] as string | undefined;
            if (!idk) {
                throw new HttpException('Missing X-Idempotency-Key', HttpStatus.BAD_REQUEST);
            }
        }

        // Optional HMAC verification
        if (cfg.signature === 'hmac-sha256') {
            await this.verifyHmacSignature(ctx, req, body, cfg);
        }

        // Extract records from body
        const records: any[] = Array.isArray(body)
            ? body
            : (Array.isArray(body?.records) ? body.records : [body]);

        await this.pipelineService.startRunWithSeed(ctx, pipeline.id, records);

        return { accepted: true };
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
        const headerName = (cfg.headerName as string | undefined) ?? 'x-datahub-signature';
        const sig = (req.headers[headerName] as string | undefined)
            ?? (req.headers[headerName.toLowerCase()] as string | undefined);

        if (!sig) {
            throw new HttpException('Missing signature', HttpStatus.UNAUTHORIZED);
        }

        const secretCode = cfg.secretCode as string | undefined;
        let secret: string | undefined;

        // Try to get secret from database if secretCode is provided
        if (secretCode) {
            try {
                const sRepo = this.connection.getRepository(ctx, DataHubSecret as any);
                const s = await sRepo.findOne({ where: { code: secretCode } } as any);
                if (s?.value) {
                    secret = s.value;
                }
            } catch (error) {
                // Database error - fail securely, don't fall back to inline secret
                throw new HttpException('Webhook signature verification unavailable', HttpStatus.SERVICE_UNAVAILABLE);
            }
        }

        // Fall back to inline secret only if no secretCode was specified
        if (!secret && !secretCode) {
            secret = String(cfg.secret ?? '');
        }

        // If secretCode was specified but secret not found, fail securely
        if (!secret) {
            throw new HttpException('Webhook secret not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const payload = JSON.stringify(body ?? {});
        const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

        // Use timing-safe comparison to prevent timing attacks
        const sigBuffer = Buffer.from(sig, 'utf8');
        const expectedBuffer = Buffer.from(expected, 'utf8');

        // Ensure buffers are same length for timingSafeEqual
        if (sigBuffer.length !== expectedBuffer.length) {
            throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
        }

        if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
        }
    }
}
