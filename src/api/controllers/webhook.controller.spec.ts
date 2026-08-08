import * as crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { HttpStatus } from '@nestjs/common';
import { PipelineStatus } from '../../constants';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import { RateLimitBackendUnavailableError } from '../../services/rate-limit';
import { DataHubWebhookController } from './webhook.controller';

function createFixture(
    triggerConfig: Record<string, unknown>,
    status = PipelineStatus.PUBLISHED,
) {
    const pipeline = {
        id: 1,
        code: 'orders',
        enabled: true,
        status,
        currentRevisionId: 7,
        definition: {
            version: 1,
            steps: [{
                key: 'incoming-orders',
                type: 'TRIGGER',
                config: { type: 'WEBHOOK', ...triggerConfig },
            }],
        },
    };
    const revision = {
        id: 7,
        pipelineId: 1,
        type: 'PUBLISHED',
        definition: pipeline.definition,
    };
    const requestContextService = {
        create: vi.fn(async () => ({ channelId: 1 })),
    };
    const connection = {
        getRepository: vi.fn((_ctx, entity) => (
            entity === Pipeline
                ? { findOne: vi.fn(async () => pipeline) }
                : entity === PipelineRevision
                    ? { find: vi.fn(async () => [revision]) }
                    : {}
        )),
    };
    const pipelineService = {
        startRunWithSeed: vi.fn(async () => ({ id: 8 })),
        startIdempotentRunWithSeed: vi.fn(async () => ({
            run: { id: 9 },
            duplicate: true,
        })),
    };
    const secretService = { resolve: vi.fn(async () => 'signing-secret') };
    const domainEvents = { publishTriggerFired: vi.fn() };
    const rateLimitService = {
        isRateLimited: vi.fn(async () => ({ limited: false, resetAt: 0, retryAfter: 0 })),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const controller = new DataHubWebhookController(
        requestContextService as never,
        connection as never,
        pipelineService as never,
        secretService as never,
        domainEvents as never,
        rateLimitService as never,
        { createLogger: vi.fn(() => logger) } as never,
    );
    return {
        controller,
        requestContextService,
        connection,
        pipelineService,
        secretService,
        domainEvents,
        rateLimitService,
    };
}

function request(headers: Record<string, string>, rawBody?: Buffer): Request {
    return {
        headers,
        ip: '203.0.113.10',
        rawBody,
    } as unknown as Request;
}

function signJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
        .createHmac('sha256', 'signing-secret')
        .update(`${header}.${encodedPayload}`)
        .digest('base64url');
    return `${header}.${encodedPayload}.${signature}`;
}

describe('DataHubWebhookController security boundaries', () => {
    it('returns an existing idempotent run without publishing a second trigger event', async () => {
        const fixture = createFixture({
            authentication: 'NONE',
            requireIdempotencyKey: true,
        });
        const body = { orderId: '42' };

        const result = await fixture.controller.handle(
            'orders',
            body,
            request(
                { 'x-idempotency-key': 'request-42' },
                Buffer.from(JSON.stringify(body)),
            ),
        );

        expect(result).toEqual({ accepted: true, duplicate: true, runId: '9' });
        expect(fixture.pipelineService.startIdempotentRunWithSeed).toHaveBeenCalledOnce();
        expect(fixture.pipelineService.startRunWithSeed).not.toHaveBeenCalled();
        expect(fixture.domainEvents.publishTriggerFired).not.toHaveBeenCalled();
    });

    it('fails closed when HMAC is configured without raw-body capture', async () => {
        const fixture = createFixture({
            authentication: 'HMAC',
            secretCode: 'orders-signing-secret',
        });

        await expect(fixture.controller.handle(
            'orders',
            { orderId: '42' },
            request({ 'x-datahub-signature': 'sha256=deadbeef' }),
        )).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
        expect(fixture.pipelineService.startRunWithSeed).not.toHaveBeenCalled();
    });

    it('applies the source-IP limiter before context, database, and secret work', async () => {
        const fixture = createFixture({ authentication: 'HMAC' });
        fixture.rateLimitService.isRateLimited.mockResolvedValueOnce({
            limited: true,
            resetAt: Date.now() + 60_000,
            retryAfter: 60_000,
        });

        await expect(fixture.controller.handle(
            'orders',
            { orderId: '42' },
            request({}),
        )).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
        expect(fixture.requestContextService.create).not.toHaveBeenCalled();
        expect(fixture.connection.getRepository).not.toHaveBeenCalled();
        expect(fixture.secretService.resolve).not.toHaveBeenCalled();
    });
    it('rejects webhook admission when configured distributed rate limiting is unavailable', async () => {
        const fixture = createFixture({ authentication: 'NONE' });
        fixture.rateLimitService.isRateLimited.mockRejectedValueOnce(
            new RateLimitBackendUnavailableError(),
        );

        await expect(fixture.controller.handle(
            'orders',
            { orderId: '42' },
            request({}),
        )).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
        expect(fixture.requestContextService.create).not.toHaveBeenCalled();
        expect(fixture.connection.getRepository).not.toHaveBeenCalled();
        expect(fixture.pipelineService.startRunWithSeed).not.toHaveBeenCalled();
    });


    it('continues authenticating and running the active revision while a draft is edited', async () => {
        const fixture = createFixture({
            authentication: 'API_KEY',
            apiKeySecretCode: 'orders-api-key',
        }, PipelineStatus.DRAFT);

        await expect(fixture.controller.handle(
            'orders',
            { orderId: '42' },
            request({}),
        )).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });

        await expect(fixture.controller.handle(
            'orders',
            { orderId: '42' },
            request({ 'x-api-key': 'signing-secret' }),
        )).resolves.toMatchObject({ accepted: true, duplicate: false });
        expect(fixture.pipelineService.startRunWithSeed).toHaveBeenCalledWith(
            expect.anything(),
            1,
            expect.anything(),
            expect.objectContaining({ expectedRevisionId: 7 }),
        );
    });

    it('accepts a signed, unexpired JWT with matching issuer and audience', async () => {
        const fixture = createFixture({
            authentication: 'JWT',
            jwtSecretCode: 'orders-jwt-secret',
            jwtIssuer: 'orders-service',
            jwtAudience: 'data-hub',
        });
        const token = signJwt({
            exp: Math.floor(Date.now() / 1_000) + 60,
            iss: 'orders-service',
            aud: ['other-service', 'data-hub'],
        });

        await expect(fixture.controller.handle(
            'orders',
            { orderId: '42' },
            request({ authorization: `Bearer ${token}` }),
        )).resolves.toMatchObject({ accepted: true, duplicate: false });
    });

    it('rejects JWTs without expiration or with the wrong issuer before starting a run', async () => {
        const fixture = createFixture({
            authentication: 'JWT',
            jwtSecretCode: 'orders-jwt-secret',
            jwtIssuer: 'orders-service',
        });

        await expect(fixture.controller.handle(
            'orders',
            { orderId: '42' },
            request({ authorization: `Bearer ${signJwt({ iss: 'orders-service' })}` }),
        )).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
        await expect(fixture.controller.handle(
            'orders',
            { orderId: '42' },
            request({ authorization: `Bearer ${signJwt({
                exp: Math.floor(Date.now() / 1_000) + 60,
                iss: 'wrong-service',
            })}` }),
        )).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
        expect(fixture.pipelineService.startRunWithSeed).not.toHaveBeenCalled();
    });
});
