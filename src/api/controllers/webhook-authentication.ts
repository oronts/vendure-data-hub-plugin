import { HttpException, HttpStatus } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import type { Request } from 'express';
import * as crypto from 'crypto';
import type { PipelineTrigger } from '../../types';
import {
    AUTH_SCHEMES,
    DEFAULT_WEBHOOK_CONFIG,
    WEBHOOK,
} from '../../constants';
import { ConnectionAuthType } from '../../../shared/types/adapter-config.types';
import type { SecretService } from '../../services/config/secret.service';
import { verifyIncomingWebhookJwt } from './webhook-request.utils';

const AUTHENTICATION_TYPES = new Set([
    ConnectionAuthType.NONE,
    ConnectionAuthType.BASIC,
    ConnectionAuthType.API_KEY,
    ConnectionAuthType.HMAC,
    ConnectionAuthType.JWT,
]);

export class IncomingWebhookAuthenticator {
    constructor(private readonly secrets: SecretService) {}

    resolveType(config: Partial<PipelineTrigger>): ConnectionAuthType {
        const authType = config.authentication as ConnectionAuthType | undefined;
        if (!authType || !AUTHENTICATION_TYPES.has(authType)) {
            throw new HttpException(
                'Invalid webhook authentication configuration',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
        return authType;
    }

    async authenticate(
        ctx: RequestContext,
        request: Request,
        config: Partial<PipelineTrigger>,
    ): Promise<void> {
        const authType = this.resolveType(config);
        if (authType === ConnectionAuthType.API_KEY) {
            await this.verifyApiKey(ctx, request, config);
        } else if (authType === ConnectionAuthType.HMAC) {
            await this.verifyHmac(ctx, request, config);
        } else if (authType === ConnectionAuthType.BASIC) {
            await this.verifyBasic(ctx, request, config);
        } else if (authType === ConnectionAuthType.JWT) {
            await this.verifyJwt(ctx, request, config);
        }
    }

    private async verifyApiKey(
        ctx: RequestContext,
        request: Request,
        config: Partial<PipelineTrigger>,
    ): Promise<void> {
        const headerName = (
            config.apiKeyHeaderName ?? DEFAULT_WEBHOOK_CONFIG.apiKeyHeaderName!
        ).toLowerCase();
        const apiKey = request.headers[headerName] as string | undefined;
        if (!apiKey) {
            throw new HttpException('Missing API key', HttpStatus.UNAUTHORIZED);
        }
        if (apiKey.length > WEBHOOK.MAX_API_KEY_LENGTH) {
            throw new HttpException('Invalid API key format', HttpStatus.BAD_REQUEST);
        }

        const secretValue = await this.resolveSecret(
            ctx,
            config.apiKeySecretCode,
            'API key secret code not configured',
            HttpStatus.INTERNAL_SERVER_ERROR,
            'API key not found',
            HttpStatus.UNAUTHORIZED,
        );
        const prefix = config.apiKeyPrefix ?? '';
        const providedKey = apiKey.startsWith(prefix)
            ? apiKey.slice(prefix.length)
            : apiKey;
        if (!timingSafeCompare(secretValue, providedKey)) {
            throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
        }
    }

    private async verifyHmac(
        ctx: RequestContext,
        request: Request,
        config: Partial<PipelineTrigger>,
    ): Promise<void> {
        const headerName = config.hmacHeaderName ?? DEFAULT_WEBHOOK_CONFIG.hmacHeaderName!;
        const signature = request.headers[headerName.toLowerCase()] as string | undefined;
        if (!signature) {
            throw new HttpException('Missing signature', HttpStatus.UNAUTHORIZED);
        }
        if (signature.length > WEBHOOK.MAX_SIGNATURE_LENGTH) {
            throw new HttpException('Invalid signature format', HttpStatus.BAD_REQUEST);
        }

        const secretValue = await this.resolveSecret(
            ctx,
            config.secretCode,
            'HMAC secret code not configured',
            HttpStatus.INTERNAL_SERVER_ERROR,
            'HMAC secret not found',
            HttpStatus.INTERNAL_SERVER_ERROR,
        );
        const algorithm = config.hmacAlgorithm?.toLowerCase() ?? 'sha256';
        if (!WEBHOOK.ALLOWED_HMAC_ALGORITHMS.includes(algorithm)) {
            throw new HttpException('Unsupported HMAC algorithm', HttpStatus.BAD_REQUEST);
        }
        const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
        if (!rawBody) {
            throw new HttpException(
                'HMAC webhook authentication requires the Data Hub early JSON middleware to capture the request before parsing',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
        const expectedHash = crypto.createHmac(algorithm, secretValue)
            .update(rawBody)
            .digest('hex');
        const cleanSignature = signature.startsWith(`${algorithm}=`)
            ? signature.slice(algorithm.length + 1)
            : signature;
        if (!timingSafeCompare(expectedHash, cleanSignature)) {
            throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
        }
    }

    private async verifyBasic(
        ctx: RequestContext,
        request: Request,
        config: Partial<PipelineTrigger>,
    ): Promise<void> {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            throw new HttpException('Missing Authorization header', HttpStatus.UNAUTHORIZED);
        }
        const basicPrefix = `${AUTH_SCHEMES.BASIC} `;
        if (!authHeader.startsWith(basicPrefix)) {
            throw new HttpException('Invalid Authorization header format', HttpStatus.UNAUTHORIZED);
        }

        const decoded = Buffer.from(authHeader.slice(basicPrefix.length), 'base64').toString('utf8');
        const colonIndex = decoded.indexOf(':');
        if (colonIndex < 1 || colonIndex === decoded.length - 1) {
            throw new HttpException('Invalid credentials format', HttpStatus.UNAUTHORIZED);
        }
        const secretValue = await this.resolveSecret(
            ctx,
            config.basicSecretCode,
            'Authentication configuration error',
            HttpStatus.UNAUTHORIZED,
            'Basic auth credentials not found',
            HttpStatus.UNAUTHORIZED,
        );
        if (!timingSafeCompare(secretValue, decoded)) {
            throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
        }
    }

    private async verifyJwt(
        ctx: RequestContext,
        request: Request,
        config: Partial<PipelineTrigger>,
    ): Promise<void> {
        const headerName = config.jwtHeaderName ?? DEFAULT_WEBHOOK_CONFIG.jwtHeaderName!;
        const authHeader = request.headers[headerName.toLowerCase()] as string | undefined;
        if (!authHeader) {
            throw new HttpException('Missing Authorization header', HttpStatus.UNAUTHORIZED);
        }
        if (authHeader.length > WEBHOOK.MAX_AUTH_HEADER_LENGTH) {
            throw new HttpException('Authorization header too large', HttpStatus.BAD_REQUEST);
        }
        const [scheme, token] = authHeader.split(' ');
        if (scheme?.toLowerCase() !== AUTH_SCHEMES.BEARER.toLowerCase() || !token) {
            throw new HttpException('Invalid Authorization header format', HttpStatus.UNAUTHORIZED);
        }

        const secretValue = await this.resolveSecret(
            ctx,
            config.jwtSecretCode,
            'Authentication configuration error',
            HttpStatus.UNAUTHORIZED,
            'JWT secret not found',
            HttpStatus.UNAUTHORIZED,
        );
        verifyIncomingWebhookJwt(token, secretValue, {
            issuer: config.jwtIssuer,
            audience: config.jwtAudience,
        });
    }

    private async resolveSecret(
        ctx: RequestContext,
        secretCode: string | undefined,
        missingConfigurationMessage: string,
        missingConfigurationStatus: HttpStatus,
        missingSecretMessage: string,
        missingSecretStatus: HttpStatus,
    ): Promise<string> {
        if (!secretCode) {
            throw new HttpException(missingConfigurationMessage, missingConfigurationStatus);
        }
        const secret = await this.secrets.resolve(ctx, secretCode);
        if (!secret) {
            throw new HttpException(missingSecretMessage, missingSecretStatus);
        }
        return secret;
    }
}

function timingSafeCompare(expected: string, provided: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    const maxLength = Math.max(expectedBuffer.length, providedBuffer.length);
    const paddedExpected = Buffer.alloc(maxLength);
    const paddedProvided = Buffer.alloc(maxLength);
    expectedBuffer.copy(paddedExpected);
    providedBuffer.copy(paddedProvided);
    return crypto.timingSafeEqual(paddedExpected, paddedProvided)
        && expectedBuffer.length === providedBuffer.length;
}
