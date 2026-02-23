/**
 * Rate Limit Service Holder
 *
 * Provides access to the RateLimitService from NestJS DI for non-DI contexts.
 * The service is registered during module initialization.
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { RateLimitService } from '../services/rate-limit';

/**
 * Service holder that provides access to RateLimitService for non-DI contexts.
 * This is injected by NestJS and registers itself during module initialization.
 *
 * This pattern allows code outside the DI container to
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
