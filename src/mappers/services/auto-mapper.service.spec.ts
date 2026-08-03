import { describe, expect, it } from 'vitest';
import { AutoMapperService } from './auto-mapper.service';
import { DEFAULT_AUTO_MAPPER_CONFIG } from '../types/auto-mapper-config.types';

describe('AutoMapperService configuration', () => {
    it('does not expose mutable internal configuration', () => {
        const service = new AutoMapperService();
        const returned = service.getConfig();
        returned.weights.nameSimilarity = 0;
        returned.customAliases.sku = ['externalSku'];
        returned.excludeFields.push('secret');

        expect(service.getConfig()).toEqual(DEFAULT_AUTO_MAPPER_CONFIG);
    });

    it('copies caller-owned nested configuration', () => {
        const service = new AutoMapperService();
        const customAliases = { sku: ['externalSku'] };
        const excludeFields = ['secret'];
        const weights = {
            nameSimilarity: 0.5,
            typeCompatibility: 0.3,
            descriptionMatch: 0.2,
        };

        service.setConfig({ customAliases, excludeFields, weights });
        customAliases.sku.push('mutated');
        excludeFields.push('mutated');
        weights.nameSimilarity = 1;

        expect(service.getConfig()).toMatchObject({
            customAliases: { sku: ['externalSku'] },
            excludeFields: ['secret'],
            weights: {
                nameSimilarity: 0.5,
                typeCompatibility: 0.3,
                descriptionMatch: 0.2,
            },
        });
    });

    it('rejects invalid direct-service configuration', () => {
        const service = new AutoMapperService();

        expect(() => service.setConfig({ confidenceThreshold: 2 }))
            .toThrow('confidenceThreshold must be between 0 and 1');
        expect(() => service.setConfig({
            weights: {
                nameSimilarity: Number.NaN,
                typeCompatibility: 0.3,
                descriptionMatch: 0.3,
            },
        })).toThrow('weightNameSimilarity must be between 0 and 1');
    });

    it('restores isolated defaults', () => {
        const service = new AutoMapperService();
        service.setConfig({ excludeFields: ['sku'] });
        service.resetConfig();

        const config = service.getConfig();
        expect(config).toEqual(DEFAULT_AUTO_MAPPER_CONFIG);
        expect(config).not.toBe(DEFAULT_AUTO_MAPPER_CONFIG);
        expect(config.weights).not.toBe(DEFAULT_AUTO_MAPPER_CONFIG.weights);
    });
});
