import { describe, expect, it } from 'vitest';
import { ConnectorRegistry, defineConnector } from './registry';
import type { ConnectorDefinition } from './types';
import type { CodeFirstPipeline } from '../shared/types';
import type { ExtractorAdapter } from '../src/sdk/types';

interface TestConnectorConfig {
    instanceId?: string;
    source: string;
}

const pipeline = (source: string): CodeFirstPipeline => ({
    code: `sync-${source.toLowerCase()}`,
    name: `Sync ${source}`,
    definition: {
        version: 1,
        name: `Sync ${source}`,
        steps: [],
    },
});

function extractor(code: string): ExtractorAdapter<unknown> {
    return {
        type: 'EXTRACTOR',
        code,
        schema: { fields: [] },
        async *extract() {
            yield* [];
        },
    };
}

const definition: ConnectorDefinition<TestConnectorConfig> = {
    code: 'test',
    name: 'Test connector',
    description: 'Connector factory contract test',
    version: '1.0.0',
    importTemplates: [{
        id: 'test-import',
        name: 'Test import',
        description: 'Test',
        category: 'catalog',
        requiredFields: [],
    }],
    exportTemplates: [{
        id: 'test-export',
        name: 'Test export',
        description: 'Test',
        format: 'JSON',
    }],
    createPipelines: config => [pipeline(config.source)],
};

describe('connector factory contract', () => {
    it('returns generated pipelines and exposes definition metadata', () => {
        const connector = defineConnector(definition);
        const configured = connector({ source: 'PIM' });

        expect(configured).toEqual({
            definition,
            config: { source: 'PIM' },
            pipelines: [pipeline('PIM')],
        });
        expect(connector.definition).toBe(definition);
        expect(connector.importTemplates).toBe(definition.importTemplates);
        expect(connector.exportTemplates).toBe(definition.exportTemplates);
        expect(connector.createPipelines({ source: 'ERP' })).toEqual([pipeline('ERP')]);
    });

    it('accepts a connector factory in ConnectorRegistry', () => {
        const connector = defineConnector(definition);
        const registry = new ConnectorRegistry();

        expect(registry.register(connector, { source: 'PIM' })).toMatchObject({
            success: true,
            connectorCode: 'test',
            pipelineCount: 1,
        });
        expect(registry.getPipelines('test')).toEqual([pipeline('PIM')]);
    });

    it('removes stale adapters when a connector is replaced', () => {
        const registry = new ConnectorRegistry();
        const initial = {
            ...definition,
            extractors: [extractor('current'), extractor('stale')],
        };
        const replacement = {
            ...definition,
            extractors: [extractor('current')],
        };

        expect(registry.register(initial, { source: 'PIM' }).success).toBe(true);
        expect(registry.getExtractors().map(adapter => adapter.code)).toEqual([
            'test:current',
            'test:stale',
        ]);

        expect(registry.register(replacement, { source: 'ERP' }).success).toBe(true);
        expect(registry.getExtractors().map(adapter => adapter.code)).toEqual([
            'test:current',
        ]);
        expect(registry.getConnector('test')?.config).toMatchObject({ source: 'ERP' });
    });

    it('leaves the previous registration unchanged when candidate capacity is exceeded', () => {
        const registry = new ConnectorRegistry();
        const initial = {
            ...definition,
            extractors: [extractor('current')],
        };
        expect(registry.register(initial, { source: 'PIM' }).success).toBe(true);
        const previous = registry.getConnector('test');
        const oversized = {
            ...definition,
            extractors: Array.from(
                { length: 5_001 },
                (_, index) => extractor(`extractor-${index}`),
            ),
        };

        const result = registry.register(oversized, { source: 'ERP' });

        expect(result).toMatchObject({
            success: false,
            extractorCount: 0,
            errors: [expect.stringContaining('Extractor registry is full')],
        });
        expect(registry.getConnector('test')).toBe(previous);
        expect(registry.getExtractors().map(adapter => adapter.code)).toEqual([
            'test:current',
        ]);
    });

    it('applies defaults and rejects invalid factory configuration', () => {
        const connector = defineConnector<TestConnectorConfig>({
            ...definition,
            defaultConfig: { source: 'PIM' },
            validateConfig: config => ({
                valid: config.source !== 'invalid',
                errors: config.source === 'invalid' ? ['source is invalid'] : [],
            }),
        });

        expect(connector({} as TestConnectorConfig).config).toEqual({ source: 'PIM' });
        expect(() => connector({ source: 'invalid' })).toThrow(
            'Invalid Test connector configuration: source is invalid',
        );
    });
});
