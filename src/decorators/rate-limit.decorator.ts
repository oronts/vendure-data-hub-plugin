/**
 * Rate Limit Decorator
 * 
 * NestJS decorator for rate limiting API endpoints.
 * Uses RateLimitService to enforce limits per IP and per resource.
 */

import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitService } from '../services/rate-limit';
import { INTERNAL_TIMINGS } from '../constants/defaults';

export interface RateLimitOptions {
    /** Maximum requests per window (default: 60) */
    maxRequests?: number;

    /** Time window in milliseconds (default: 60000 = 1 minute) */
    windowMs?: number;

    /** Include IP address in rate limit key (default: true) */
    useIp?: boolean;

    /** Include pipeline code in rate limit key (if available) */
    usePipeline?: boolean;

    /** Custom identifier for rate limit key */
    identifier?: string;

    /** Custom message when rate limited (default: 'Too many requests') */
    message?: string;

    /** Custom status code when rate limited (default: 429) */
    statusCode?: HttpStatus;
}

function getRateLimitService(context: ExecutionContext): RateLimitService {
    const contextWithService = context as ExecutionContext & { rateLimitService?: RateLimitService };
    // RateLimitService requires a DataHubLoggerFactory - use a minimal fallback if not available
    if (contextWithService.rateLimitService) {
        return contextWithService.rateLimitService;
    }
    // Create a minimal logger factory for fallback
    const minimalLoggerFactory = {
        createLogger: () => ({
            info: () => {},
            warn: () => {},
            error: () => {},
            debug: () => {},
        }),
    } as unknown as import('../services/logger').DataHubLoggerFactory;
    return new RateLimitService(minimalLoggerFactory);
}

/**
 * Rate Limit Decorator Factory
 */
export function RateLimit(options: RateLimitOptions = {}): MethodDecorator {
    return (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function(this: unknown, ...args: unknown[]) {
            const context = args[args.length - 1] as ExecutionContext;
            const request = context.switchToHttp().getRequest() as {
                ip?: string;
                connection?: { remoteAddress?: string };
                params?: { code?: string; id?: string };
            };

            const ip = request.ip || request.connection?.remoteAddress || 'unknown';
            const pipelineCode = request.params?.code || request.params?.id;
            const rateLimitService = getRateLimitService(context);

            const result = rateLimitService.isRateLimited(
                {
                    ip: options.useIp !== false ? ip : undefined,
                    pipelineCode: options.usePipeline ? pipelineCode : undefined,
                    identifier: options.identifier,
                },
                options.maxRequests || INTERNAL_TIMINGS.DEFAULT_RATE_LIMIT_MAX_REQUESTS,
                options.windowMs || INTERNAL_TIMINGS.DEFAULT_RATE_LIMIT_WINDOW_MS,
            );

            if (result.limited) {
                throw new HttpException(
                    options.message || 'Too many requests',
                    options.statusCode || HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}
