/**
 * Rate Limit Guard
 *
 * NestJS guard for rate limiting API endpoints.
 * Can be used with @UseGuards() decorator on controllers or methods.
 *
 * Usage:
 *   @UseGuards(RateLimitGuard)
 *   @RateLimit({ maxRequests: 100, windowMs: 60000 })
 *   async myEndpoint() { ... }
 *
 * Note: The webhook controller implements rate limiting directly via RateLimitService
 * for more control. This guard is provided for simple use cases on other endpoints.
 */

import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService, RateLimitKey } from '../services/rate-limit';

export interface RateLimitOptions {
    maxRequests?: number;
    windowMs?: number;
    useIp?: boolean;
    usePipeline?: boolean;
    identifier?: string;
    message?: string;
    statusCode?: HttpStatus;
}

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
    constructor(
        private readonly rateLimitService: RateLimitService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
            context.getHandler(),
            context.getClass(),
        ]) || {};

        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        // Build rate limit key
        const ip = request.ip || request.connection?.remoteAddress || 'unknown';
        const pipelineCode = request.params?.code || request.params?.id;

        const key: RateLimitKey = {
            ip: options.useIp !== false ? ip : undefined,
            pipelineCode: options.usePipeline ? pipelineCode : undefined,
            identifier: options.identifier,
        };

        const maxRequests = options.maxRequests || 60;
        const windowMs = options.windowMs || 60000;

        const result = this.rateLimitService.isRateLimited(key, maxRequests, windowMs);

        // Set rate limit headers
        response.setHeader('X-RateLimit-Limit', String(maxRequests));
        response.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

        if (result.limited) {
            response.setHeader('X-RateLimit-Remaining', '0');
            response.setHeader('Retry-After', String(Math.ceil(result.retryAfter / 1000)));

            throw new HttpException(
                options.message || 'Too many requests',
                options.statusCode || HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const count = this.rateLimitService.getCount(key);
        response.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count)));

        return true;
    }
}
