import { afterEach, describe, expect, it } from 'vitest';
import type {
    BatchExtractorAdapter,
    ExtractorAdapter,
    LoaderAdapter,
    OperatorAdapter,
} from '../sdk/types';
import {
    clearRegistry,
    getAdapter,
    registerAdapter,
    registerExtractor,
    registerLoader,
    registerOperator,
} from './registry';

afterEach(() => {
    clearRegistry();
});

describe('module-level extractor registry', () => {
    it('rejects invalid lifecycle metadata before mutating registry state', () => {
        expect(() => registerAdapter({
            type: 'OPERATOR',
            code: 'old-operator',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
            deprecatedMessage: 'Use current-operator.',
        })).toThrow(/requires deprecated to be true/);
        expect(getAdapter('old-operator')).toBeUndefined();
    });

    it('retains a streaming extractor runtime', () => {
        const extractor: ExtractorAdapter<unknown> = {
            type: 'EXTRACTOR',
            code: 'module-stream',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
            async *extract() {
                yield { data: { id: 1 } };
            },
        };

        registerExtractor(extractor);

        expect(typeof (getAdapter(extractor.code) as unknown as { extract?: unknown }).extract)
            .toBe('function');
    });

    it('retains a batch extractor runtime', () => {
        const extractor: BatchExtractorAdapter<unknown> = {
            type: 'EXTRACTOR',
            code: 'module-batch',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
            async extractAll() {
                return { records: [] };
            },
            async preview() {
                return { records: [] };
            },
        };

        registerExtractor(extractor);

        expect(typeof (getAdapter(extractor.code) as unknown as { extractAll?: unknown }).extractAll)
            .toBe('function');
    });

    it('rejects an unbounded batch extractor', () => {
        const invalid = {
            type: 'EXTRACTOR',
            code: 'unbounded-batch',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
            async extractAll() {
                return { records: [] };
            },
        } as unknown as BatchExtractorAdapter<unknown>;

        expect(() => registerExtractor(invalid)).toThrow(/must implement preview/);
        expect(getAdapter('unbounded-batch')).toBeUndefined();
    });

    it('rejects definition-only extractor registration', () => {
        const invalid = {
            type: 'EXTRACTOR',
            code: 'definition-only',
            schema: { fields: [] },
        } as unknown as ExtractorAdapter<unknown>;

        expect(() => registerExtractor(invalid)).toThrow(/extract\(\) or extractAll\(\)/);
        expect(getAdapter('definition-only')).toBeUndefined();
    });
});

describe('module-level executable adapter registry', () => {
    it('retains loader and operator runtime methods', () => {
        const loader = {
            type: 'LOADER',
            code: 'module-loader',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
            load: async () => ({ ok: 0, fail: 0, skipped: 0 }),
        } as unknown as LoaderAdapter<unknown>;
        const operator = {
            type: 'OPERATOR',
            code: 'module-operator',
            version: '1.0.0',
            apiVersion: 1,
            pure: true,
            schema: { fields: [] },
            apply: () => ({ records: [] }),
        } as unknown as OperatorAdapter<unknown>;

        registerLoader(loader);
        registerOperator(operator);

        expect(typeof (getAdapter(loader.code) as unknown as { load?: unknown }).load)
            .toBe('function');
        expect(typeof (getAdapter(operator.code) as unknown as { apply?: unknown }).apply)
            .toBe('function');
    });

    it('rejects definition-only typed registrations', () => {
        const definition = {
            type: 'LOADER',
            code: 'definition-only-loader',
            schema: { fields: [] },
        } as unknown as LoaderAdapter<unknown>;

        expect(() => registerLoader(definition)).toThrow(/with load\(\)/);
        expect(getAdapter(definition.code)).toBeUndefined();
    });
});
