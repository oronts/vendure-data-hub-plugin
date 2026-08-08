import { describe, expect, it } from 'vitest';
import { AdapterType } from '../constants/enums';
import type {
    BatchExtractorAdapter,
    DataHubAdapter,
    ExtractorAdapter,
} from './types';
import { DataHubRegistryService } from './registry.service';
import { queueAdapterRegistry } from './index';

function createStreamingExtractor(code: string): ExtractorAdapter<unknown> {
    return {
        type: 'EXTRACTOR',
        code,
        version: '1.0.0',
        apiVersion: 1,
        schema: { fields: [] },
        async *extract() {
            yield { data: { id: 'stream-record' } };
        },
    };
}

function createBatchExtractor(code: string): BatchExtractorAdapter<unknown> {
    return {
        type: 'EXTRACTOR',
        code,
        version: '1.0.0',
        apiVersion: 1,
        schema: { fields: [] },
        async extractAll() {
            return { records: [{ data: { id: 'batch-record' } }] };
        },
        async preview() {
            return { records: [{ data: { id: 'batch-record' } }] };
        },
    };
}

interface TypedExtractorConfig {
    endpoint: string;
}

function createTypedExtractor(code: string): ExtractorAdapter<TypedExtractorConfig> {
    return {
        type: 'EXTRACTOR',
        code,
        version: '1.0.0',
        apiVersion: 1,
        schema: { fields: [] },
        async *extract(_context, config) {
            yield { data: { endpoint: config.endpoint } };
        },
    };
}

describe('DataHubRegistryService runtime extractors', () => {
    it('rejects invalid lifecycle metadata without registering a definition', () => {
        const registry = new DataHubRegistryService();

        expect(() => registry.register({
            type: AdapterType.OPERATOR,
            code: 'old-operator',
            schema: { fields: [] },
            deprecated: true,
        })).toThrow(/requires deprecatedMessage/);
        expect(registry.find(AdapterType.OPERATOR, 'old-operator')).toBeUndefined();
    });

    it('registers and narrows a streaming extractor', () => {
        const registry = new DataHubRegistryService();
        const extractor = createStreamingExtractor('custom-stream');

        registry.registerRuntime(extractor);

        expect(registry.getExtractorRuntime(extractor.code)).toBe(extractor);
    });

    it('registers and narrows a batch extractor', () => {
        const registry = new DataHubRegistryService();
        const extractor = createBatchExtractor('custom-batch');

        registry.registerRuntime(extractor);

        expect(registry.getExtractorRuntime(extractor.code)).toBe(extractor);
    });

    it('registers an extractor with a strongly typed configuration', () => {
        const registry = new DataHubRegistryService();
        const extractor = createTypedExtractor('typed-stream');

        registry.registerRuntime(extractor);

        expect(registry.getExtractorRuntime(extractor.code)).toBe(extractor);
    });

    it('rejects an extractor without an execution method', () => {
        const registry = new DataHubRegistryService();
        const invalid = {
            type: AdapterType.EXTRACTOR,
            code: 'missing-runtime',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
        } as unknown as DataHubAdapter;

        expect(() => registry.registerRuntime(invalid)).toThrow(
            /must implement extract\(\) or extractAll\(\)/,
        );
        expect(registry.getRuntime(AdapterType.EXTRACTOR, 'missing-runtime'))
            .toBeUndefined();
    });

    it('rejects a batch extractor without bounded preview', () => {
        const registry = new DataHubRegistryService();
        const invalid = {
            type: AdapterType.EXTRACTOR,
            code: 'unbounded-batch',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
            async extractAll() {
                return { records: [] };
            },
        } as unknown as DataHubAdapter;

        expect(() => registry.registerRuntime(invalid)).toThrow(
            /must implement preview/,
        );
        expect(registry.getExtractorRuntime('unbounded-batch')).toBeUndefined();
    });

    it('does not partially register runtime state when definition capacity is exhausted', () => {
        const registry = new DataHubRegistryService();
        for (let index = 0; index < 1000; index++) {
            registry.register({
                type: AdapterType.OPERATOR,
                code: `operator-${index}`,
                schema: { fields: [] },
            });
        }

        expect(() => registry.registerRuntime(
            createStreamingExtractor('over-capacity'),
        )).toThrow(/definition registry is full/);
        expect(registry.getRuntime(AdapterType.EXTRACTOR, 'over-capacity'))
            .toBeUndefined();
    });

    it.each([
        [AdapterType.OPERATOR, 'apply() or applyOne()'],
        [AdapterType.LOADER, 'load()'],
        [AdapterType.VALIDATOR, 'validate()'],
        [AdapterType.ENRICHER, 'enrich()'],
        [AdapterType.EXPORTER, 'export()'],
        [AdapterType.FEED, 'generateFeed()'],
        [AdapterType.SINK, 'index()'],
    ])('rejects a %s adapter without its execution method', (type, contract) => {
        const registry = new DataHubRegistryService();
        const invalid = {
            type,
            code: 'missing-runtime',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
        } as unknown as DataHubAdapter;

        expect(() => registry.registerRuntime(invalid)).toThrow(
            'must implement ' + contract,
        );
        expect(registry.getRuntime(type, 'missing-runtime')).toBeUndefined();
    });

    it('rejects duplicate runtime registration without replacing the original', () => {
        const registry = new DataHubRegistryService();
        const original = createStreamingExtractor('duplicate-runtime');

        registry.registerRuntime(original);

        expect(() => registry.registerRuntime(
            createStreamingExtractor('duplicate-runtime'),
        )).toThrow('Runtime adapter already registered');
        expect(registry.getRuntime(AdapterType.EXTRACTOR, original.code)).toBe(original);
    });

    it('rejects a custom runtime for a built-in definition', () => {
        const registry = new DataHubRegistryService();
        registry.register({
            type: AdapterType.EXTRACTOR,
            code: 'reserved-extractor',
            schema: { fields: [] },
        }, { builtIn: true });

        expect(() => registry.registerRuntime(
            createStreamingExtractor('reserved-extractor'),
            { builtIn: false },
        )).toThrow('Custom runtime cannot override built-in adapter');
        expect(registry.getRuntime(AdapterType.EXTRACTOR, 'reserved-extractor'))
            .toBeUndefined();
    });

    it('rejects catalog and runtime metadata drift atomically', () => {
        const registry = new DataHubRegistryService();
        registry.register({
            type: AdapterType.EXTRACTOR,
            code: 'versioned-extractor',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
        }, { builtIn: false });
        const runtime = {
            ...createStreamingExtractor('versioned-extractor'),
            version: '2.0.0',
        };

        expect(() => registry.registerRuntime(runtime, { builtIn: false }))
            .toThrow(/metadata does not match.*version/);
        expect(registry.getRuntime(AdapterType.EXTRACTOR, runtime.code))
            .toBeUndefined();
        expect(registry.find(AdapterType.EXTRACTOR, runtime.code)?.version)
            .toBe('1.0.0');
    });

    it('attaches a runtime when its catalog metadata matches exactly', () => {
        const registry = new DataHubRegistryService();
        const runtime = {
            ...createStreamingExtractor('matching-extractor'),
            name: 'Matching extractor',
            version: '1.0.0',
        };
        registry.register({
            type: runtime.type,
            code: runtime.code,
            name: runtime.name,
            version: runtime.version,
            apiVersion: runtime.apiVersion,
            schema: runtime.schema,
        }, { builtIn: false });

        registry.registerRuntime(runtime, { builtIn: false });

        expect(registry.getRuntime(AdapterType.EXTRACTOR, runtime.code))
            .toBe(runtime);
    });
});

describe('public SDK queue adapter exports', () => {
    it('exposes every built-in queue adapter through the SDK entry point', () => {
        expect(queueAdapterRegistry.getCodes().sort()).toEqual([
            'internal',
            'rabbitmq',
            'rabbitmq-amqp',
            'redis-streams',
            'sqs',
        ]);
    });
});
