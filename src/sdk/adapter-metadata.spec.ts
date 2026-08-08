import { describe, expect, it } from 'vitest';
import {
    validateAdapterLifecycleMetadata,
    validateBatchExtractorPreview,
} from './adapter-metadata';

describe('validateAdapterLifecycleMetadata', () => {
    it('accepts exact semantic versions and complete deprecation guidance', () => {
        expect(() => validateAdapterLifecycleMetadata({
            code: 'catalog-source',
            version: '1.0.0',
            apiVersion: 1,
            deprecated: true,
            deprecatedMessage: 'Use catalog-source-v2.',
        }, { requireVersion: true })).not.toThrow();
    });

    it('rejects descriptive versions that cannot be pinned exactly', () => {
        expect(() => validateAdapterLifecycleMetadata({
            code: 'catalog-source',
            version: '2026.07',
            apiVersion: 1,
        }, { requireVersion: true })).toThrow(/canonical semantic version/);
    });

    it.each([
        { version: '' },
        { version: ' 1.0.0' },
        { version: '1.0.0 ' },
        { version: 1 as unknown as string },
    ])('rejects invalid version metadata %#', metadata => {
        expect(() => validateAdapterLifecycleMetadata({
            code: 'catalog-source',
            ...metadata,
        })).toThrow(/version must be a trimmed non-empty string/);
    });

    it('requires migration guidance for deprecated adapters', () => {
        expect(() => validateAdapterLifecycleMetadata({
            code: 'catalog-source',
            deprecated: true,
        })).toThrow(/requires deprecatedMessage/);
    });

    it('rejects orphaned or padded deprecation guidance', () => {
        expect(() => validateAdapterLifecycleMetadata({
            code: 'catalog-source',
            deprecatedMessage: 'Use catalog-source-v2.',
        })).toThrow(/requires deprecated to be true/);
        expect(() => validateAdapterLifecycleMetadata({
            code: 'catalog-source',
            deprecated: true,
            deprecatedMessage: ' migrate ',
        })).toThrow(/deprecatedMessage must be a trimmed non-empty string/);
    });
});

describe('validateBatchExtractorPreview', () => {
    it('requires a bounded preview implementation for batch extractors', () => {
        expect(() => validateBatchExtractorPreview({
            code: 'catalog-batch',
            extractAll: () => undefined,
        })).toThrow(/must implement preview/);

        expect(() => validateBatchExtractorPreview({
            code: 'catalog-batch',
            extractAll: () => undefined,
            preview: () => undefined,
        })).not.toThrow();
    });
});
