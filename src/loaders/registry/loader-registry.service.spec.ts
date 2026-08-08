import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { DataHubLoggerFactory } from '../../services/logger';
import { LoaderRegistryService } from './loader-registry.service';

const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

function createRegistry(resolve: ModuleRef['resolve']) {
    return new LoaderRegistryService(
        { resolve } as ModuleRef,
        { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
    );
}

describe('LoaderRegistryService startup', () => {
    it('fails startup when a built-in loader cannot be resolved', async () => {
        const failure = new Error('provider unavailable');
        const registry = createRegistry(vi.fn().mockRejectedValue(failure));

        await expect(registry.onModuleInit()).rejects.toBe(failure);
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to register loaders',
            failure,
        );
    });

    it('fails startup when an extension registration callback rejects', async () => {
        const loader = {
            entityType: 'PRODUCT',
            name: 'Product loader',
            description: 'Product loader',
            supportedOperations: [],
            lookupFields: [],
            requiredFields: [],
            load: vi.fn(),
            findExisting: vi.fn(),
            validate: vi.fn(),
            getFieldSchema: vi.fn(),
        };
        const registry = createRegistry(vi.fn().mockResolvedValue(loader));
        const failure = new Error('extension registration failed');
        registry.addRegistrationCallback(vi.fn().mockRejectedValue(failure));

        await expect(registry.onModuleInit()).rejects.toBe(failure);
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to register loaders',
            failure,
        );
    });
});
