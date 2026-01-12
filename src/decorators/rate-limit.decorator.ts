/**
 * Rate Limit Decorator
 * 
 * NestJS decorator for rate limiting API endpoints.
 * Uses RateLimitService to enforce limits per IP and per resource.
 */

import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitService } from '../services/rate-limit';

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
    return (context as any).rateLimitService || new RateLimitService({} as any);
}

/**
 * Rate Limit Decorator Factory
 */
export function RateLimit(options: RateLimitOptions = {}): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function(this: any, ...args: any[]) {
            const context = args[args.length - 1] as ExecutionContext;
            const request = context.switchToHttp().getRequest();

            // Get IP address
            const ip = (request as any).ip || (request as any).connection?.remoteAddress || 'unknown';

            // Get pipeline code if applicable (from params)
            const pipelineCode = (request as any).params?.code || (request as any).params?.id;

            const rateLimitService = getRateLimitService(context);

            // Check rate limit
            const result = rateLimitService.isRateLimited(
                {
                    ip: options.useIp !== false ? ip : undefined,
                    pipelineCode: options.usePipeline ? pipelineCode : undefined,
                    identifier: options.identifier,
                },
                options.maxRequests || 60,
                options.windowMs || 60000,
            );

            if (result.limited) {
                throw new HttpException(
                    options.message || 'Too many requests',
                    options.statusCode || HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            // Execute original method
            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}
