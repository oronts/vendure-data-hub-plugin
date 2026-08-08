import { describe, expect, it } from 'vitest';
import { Pipeline } from '../../entities/pipeline';
import { DataHubPipelineAdminResolver } from './pipeline.resolver';

describe('DataHubPipelineAdminResolver capabilities', () => {
    it('exposes the same effective capabilities used by enforcement', () => {
        const registry = {
            find: (_type: string, code: string) => code === 'productUpsert'
                ? { requires: ['UpdateCatalog'] }
                : undefined,
        };
        const resolver = new DataHubPipelineAdminResolver(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            registry as never,
        );
        const value = Object.assign(new Pipeline(), {
            definition: {
                version: 1,
                capabilities: {
                    requires: ['RunDataHubPipeline'],
                    writes: ['CATALOG'],
                },
                steps: [{
                    key: 'load',
                    type: 'LOAD',
                    config: { adapterCode: 'productUpsert' },
                }],
            },
        });

        expect(resolver.requiredCapabilities(value)).toEqual([
            'RunDataHubPipeline',
            'UpdateCatalog',
        ]);
        expect(resolver.writeCapabilities(value)).toEqual(['CATALOG']);
    });
});
