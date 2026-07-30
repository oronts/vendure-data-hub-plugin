import { describe, expect, it, vi } from 'vitest';
import type { ModuleRef } from '@nestjs/core';
import type { BatchDataExtractor, DataExtractor } from '../types';
import { ExtractorRegistryService } from './extractor-registry.service';

function createExtractor(
    lifecycle: Pick<DataExtractor, 'version' | 'deprecated' | 'deprecatedMessage'>,
): DataExtractor {
    return {
        type: 'EXTRACTOR',
        code: 'catalog-source',
        name: 'Catalog source',
        category: 'CUSTOM',
        schema: { fields: [] },
        ...lifecycle,
        async *extract() {
            yield { data: { id: 'product-1' } };
        },
        async validate() {
            return { valid: true, errors: [] };
        },
    };
}

function createRegistry(): ExtractorRegistryService {
    return new ExtractorRegistryService(
        {} as ModuleRef,
        {
            createLogger: vi.fn(() => ({
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            })),
        } as never,
    );
}

describe('ExtractorRegistryService lifecycle metadata', () => {
    it('preserves valid deprecation metadata in API-facing metadata', () => {
        const registry = createRegistry();
        registry.register(createExtractor({
            version: '2.0.0',
            deprecated: true,
            deprecatedMessage: 'Use catalog-source-v3.',
        }));

        expect(registry.getExtractorInfo('catalog-source')?.metadata).toMatchObject({
            version: '2.0.0',
            deprecated: true,
            deprecatedMessage: 'Use catalog-source-v3.',
        });
    });

    it('rejects incomplete deprecation metadata before registration', () => {
        const registry = createRegistry();

        expect(() => registry.register(createExtractor({ deprecated: true })))
            .toThrow(/requires deprecatedMessage/);
        expect(registry.hasExtractor('catalog-source')).toBe(false);
    });

    it('rejects a batch extractor without bounded preview', () => {
        const registry = createRegistry();
        const extractor = {
            type: 'EXTRACTOR',
            code: 'unbounded-batch',
            name: 'Unbounded batch',
            category: 'CUSTOM',
            schema: { fields: [] },
            async extractAll() {
                return { records: [] };
            },
            async validate() {
                return { valid: true, errors: [] };
            },
        } as unknown as BatchDataExtractor;

        expect(() => registry.register(extractor)).toThrow(/must implement preview/);
        expect(registry.hasExtractor('unbounded-batch')).toBe(false);
    });
});
