/**
 * Rate Limit Decorator
 *
 * NestJS decorator for rate limiting API endpoints.
 * Uses RateLimitService to enforce limits per IP and per resource.
 *
 * IMPORTANT: This decorator uses a service holder pattern to access the RateLimitService
 * from NestJS DI. The service is registered during module initialization via
 * RateLimitServiceHolder.setService().
 *
 * For new implementations, prefer using RateLimitGuard with @UseGuards() which has
 * native DI support through constructor injection.
 */

import { HttpException, HttpStatus, Inject, Injectable, OnModuleInit } from '@nestjs/common';
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

/**
 * Service holder that provides access to RateLimitService for the decorator.
 * This is injected by NestJS and registers itself during module initialization.
 *
 * This pattern allows decorators (which cannot use constructor injection) to
 * access DI-managed services.
 */
@Injectable()
export class RateLimitServiceHolder implements OnModuleInit {
    private static instance: RateLimitService | null = null;

    constructor(
        @Inject(RateLimitService)
        private readonly rateLimitService: RateLimitService,
    ) {}

    onModuleInit(): void {
        RateLimitServiceHolder.instance = this.rateLimitService;
    }

    /**
     * Get the RateLimitService instance from the DI container.
     * Returns null if the module has not been initialized yet.
     */
    static getService(): RateLimitService | null {
        return RateLimitServiceHolder.instance;
    }

    /**
     * Reset the service holder (useful for testing).
     * @internal
     */
    static reset(): void {
        RateLimitServiceHolder.instance = null;
    }
}

/**
 * Rate Limit Decorator Factory
 *
 * This decorator uses RateLimitServiceHolder to access the RateLimitService from the
 * NestJS DI container. The service is automatically registered during module initialization.
 *
 * For new implementations, consider using RateLimitGuard with @UseGuards() which provides
 * more features (rate limit headers, Reflector-based options).
 *
 * @example
 * // Using this decorator directly:
 * @RateLimit({ maxRequests: 100, windowMs: 60000 })
 * async myEndpoint(ctx: RequestContext) { ... }
 *
 * @example
 * // Alternative using guard (recommended for REST endpoints):
 * @UseGuards(RateLimitGuard)
 * @RateLimitMeta({ maxRequests: 100, windowMs: 60000 })
 * async myEndpoint() { ... }
 */
export function RateLimit(options: RateLimitOptions = {}): MethodDecorator {
    return (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (this: unknown, ...args: unknown[]) {
            // Extract request information from arguments
            // Support both REST (request object) and GraphQL (context with req) patterns
            const request = extractRequest(args);

            const ip = request?.ip || request?.connection?.remoteAddress || 'unknown';
            const pipelineCode = request?.params?.code || request?.params?.id;

            // Get the service from the holder (properly injected via DI)
            const rateLimitService = RateLimitServiceHolder.getService();

            // If service is not available, the module hasn't been initialized yet
            if (!rateLimitService) {
                console.warn(
                    '[RateLimit] RateLimitService not available. ' +
                        'Ensure RateLimitServiceHolder is registered as a provider in your module. ' +
                        'Rate limiting will be skipped for this request.',
                );
                return originalMethod.apply(this, args);
            }

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

/**
 * Extract the HTTP request object from method arguments.
 * Supports both REST controllers and GraphQL resolvers.
 */
function extractRequest(args: unknown[]): RequestLike | null {
    for (const arg of args) {
        // Direct request object (REST controller)
        if (isRequestLike(arg)) {
            return arg;
        }

        // GraphQL context or Vendure RequestContext (both have req property)
        if (arg && typeof arg === 'object' && 'req' in arg) {
            const ctx = arg as { req: unknown };
            if (isRequestLike(ctx.req)) {
                return ctx.req;
            }
        }
    }

    return null;
}

interface RequestLike {
    ip?: string;
    connection?: { remoteAddress?: string };
    params?: { code?: string; id?: string };
}

function isRequestLike(obj: unknown): obj is RequestLike {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    // Check for common request properties
    const candidate = obj as Record<string, unknown>;
    return (
        'ip' in candidate ||
        'connection' in candidate ||
        'headers' in candidate ||
        'method' in candidate
    );
}
