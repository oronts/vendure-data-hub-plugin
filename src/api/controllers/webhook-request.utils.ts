import * as crypto from 'crypto';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'http';
import type { PipelineTrigger } from '../../types';
import { INTERNAL_TIMINGS, WEBHOOK } from '../../constants';

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export interface IncomingWebhookJwtConfig {
    issuer?: string;
    audience?: string;
}

function parseJwtObject(segment: string, label: string): Record<string, unknown> {
    try {
        const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('not an object');
        }
        return value as Record<string, unknown>;
    } catch {
        throw new HttpException(`Invalid JWT ${label}`, HttpStatus.UNAUTHORIZED);
    }
}

function timingSafeEqual(expected: string, provided: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    if (expectedBuffer.length !== providedBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function numericDate(payload: Record<string, unknown>, claim: string, required: boolean): number | undefined {
    const value = payload[claim];
    if (value === undefined && !required) {
        return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new HttpException(
            required ? `JWT requires a valid ${claim} claim` : `JWT ${claim} claim is invalid`,
            HttpStatus.UNAUTHORIZED,
        );
    }
    return value;
}

export function verifyIncomingWebhookJwt(
    token: string,
    secret: string,
    config: IncomingWebhookJwtConfig = {},
): void {
    const parts = token.split('.');
    if (parts.length !== WEBHOOK.JWT_PARTS_COUNT || parts.some(part => part.length === 0)) {
        throw new HttpException('Invalid JWT format', HttpStatus.UNAUTHORIZED);
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = parseJwtObject(headerB64, 'header');
    if (header.alg !== WEBHOOK.REQUIRED_JWT_ALGORITHM) {
        throw new HttpException(
            `Unsupported JWT algorithm: '${String(header.alg)}'. Only HS256 is accepted.`,
            HttpStatus.UNAUTHORIZED,
        );
    }
    if (header.typ !== undefined && header.typ !== 'JWT') {
        throw new HttpException('Invalid JWT type', HttpStatus.UNAUTHORIZED);
    }

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');
    if (!timingSafeEqual(expectedSignature, signatureB64)) {
        throw new HttpException('Invalid JWT signature', HttpStatus.UNAUTHORIZED);
    }

    const payload = parseJwtObject(payloadB64, 'payload');
    const nowUnix = Math.floor(Date.now() / 1_000);
    const expiresAt = numericDate(payload, 'exp', true)!;
    const notBefore = numericDate(payload, 'nbf', false);
    numericDate(payload, 'iat', false);
    if (expiresAt <= nowUnix) {
        throw new HttpException('JWT has expired', HttpStatus.UNAUTHORIZED);
    }
    if (notBefore !== undefined && notBefore > nowUnix) {
        throw new HttpException('JWT is not yet valid', HttpStatus.UNAUTHORIZED);
    }
    if (config.issuer !== undefined && payload.iss !== config.issuer) {
        throw new HttpException('JWT issuer is invalid', HttpStatus.UNAUTHORIZED);
    }
    if (config.audience !== undefined) {
        const audiences = typeof payload.aud === 'string'
            ? [payload.aud]
            : Array.isArray(payload.aud) && payload.aud.every(value => typeof value === 'string')
                ? payload.aud
                : [];
        if (!audiences.includes(config.audience)) {
            throw new HttpException('JWT audience is invalid', HttpStatus.UNAUTHORIZED);
        }
    }
}

export interface IncomingWebhookIdempotency {
    key: string;
    ttlSeconds: number;
}

export interface IncomingWebhookRateLimit {
    maxRequests: number;
    windowMs: number;
}

function assertIntegerInRange(
    value: number,
    minimum: number,
    maximum: number,
    name: string,
): number {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new HttpException(
            `Invalid webhook ${name} configuration`,
            HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
    return value;
}

export function resolveIncomingWebhookRateLimit(
    config: Partial<PipelineTrigger>,
): IncomingWebhookRateLimit {
    const maxRequests = config.rateLimit ?? INTERNAL_TIMINGS.DEFAULT_WEBHOOK_RATE_LIMIT;
    assertIntegerInRange(maxRequests, 0, WEBHOOK.MAX_RATE_LIMIT_REQUESTS, 'rateLimit');

    const windowSeconds = config.rateLimitWindow ??
        INTERNAL_TIMINGS.DEFAULT_RATE_LIMIT_WINDOW_MS / 1_000;
    assertIntegerInRange(
        windowSeconds,
        WEBHOOK.MIN_RATE_LIMIT_WINDOW_SEC,
        WEBHOOK.MAX_RATE_LIMIT_WINDOW_SEC,
        'rateLimitWindow',
    );

    return { maxRequests, windowMs: windowSeconds * 1_000 };
}

export function resolveIncomingWebhookIdempotency(
    headers: IncomingHttpHeaders,
    config: Partial<PipelineTrigger>,
): IncomingWebhookIdempotency | null {
    const headerName = config.idempotencyKeyHeader ?? WEBHOOK.DEFAULT_IDEMPOTENCY_HEADER;
    if (!HEADER_NAME_PATTERN.test(headerName)) {
        throw new HttpException(
            'Invalid webhook idempotencyKeyHeader configuration',
            HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }

    const rawKey = headers[headerName.toLowerCase()];
    if (Array.isArray(rawKey)) {
        throw new HttpException(
            `Multiple ${headerName} headers are not allowed`,
            HttpStatus.BAD_REQUEST,
        );
    }
    if (rawKey === undefined) {
        if (config.requireIdempotencyKey) {
            throw new HttpException(`Missing ${headerName}`, HttpStatus.BAD_REQUEST);
        }
        return null;
    }
    if (
        rawKey.length === 0 ||
        rawKey.trim() !== rawKey ||
        rawKey.length > WEBHOOK.IDEMPOTENCY_KEY_MAX_LENGTH
    ) {
        throw new HttpException(
            `Invalid ${headerName}; expected 1-${WEBHOOK.IDEMPOTENCY_KEY_MAX_LENGTH} non-whitespace characters`,
            HttpStatus.BAD_REQUEST,
        );
    }

    const ttlSeconds = config.idempotencyTtlSec ?? WEBHOOK.DEFAULT_IDEMPOTENCY_TTL_SEC;
    assertIntegerInRange(
        ttlSeconds,
        WEBHOOK.MIN_IDEMPOTENCY_TTL_SEC,
        WEBHOOK.MAX_IDEMPOTENCY_TTL_SEC,
        'idempotencyTtlSec',
    );
    return { key: rawKey, ttlSeconds };
}
