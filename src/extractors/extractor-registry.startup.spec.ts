import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { DataExtractor } from '../types';
import type { DataHubLoggerFactory } from '../services/logger';
import { ExtractorRegistryService } from './extractor-registry.service';

const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

const extractor: DataExtractor = {
    type: 'EXTRACTOR',
    code: 'test-source',
    name: 'Test source',
    category: 'CUSTOM',
    version: '1.0.0',
    schema: { fields: [] },
    async *extract() {
        yield { data: { id: 'record-1' } };
    },
    async validate() {
        return { valid: true, errors: [] };
    },
};

function createRegistry(get: (...args: unknown[]) => unknown) {
    return new ExtractorRegistryService(
        { get } as unknown as ModuleRef,
        { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
    );
}

describe('ExtractorRegistryService startup', () => {
    it('fails startup when a built-in extractor cannot be resolved', async () => {
        const registry = createRegistry(vi.fn(() => {
            throw new Error('provider unavailable');
        }));

        await expect(registry.onModuleInit()).rejects.toThrow(
            'Failed to register built-in extractor "httpApi": provider unavailable',
        );
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to initialize extractor registry',
            expect.any(Error),
        );
    });

    it('fails startup when an extension registration callback rejects', async () => {
        const registry = createRegistry(vi.fn(() => extractor));
        const failure = new Error('extension registration failed');
        registry.addRegistrationCallback(vi.fn().mockRejectedValue(failure));

        await expect(registry.onModuleInit()).rejects.toBe(failure);
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to initialize extractor registry',
            failure,
        );
    });
});
