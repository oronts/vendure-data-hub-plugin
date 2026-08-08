import { describe, expect, it } from 'vitest';
import { validatePipelineDefinition } from './pipeline-definition.validator';

describe('pipeline schema references', () => {
    it('accepts schema references on extract and validate steps', () => {
        expect(() => validatePipelineDefinition({
            version: 1,
            steps: [{
                key: 'source',
                type: 'EXTRACT',
                config: {},
                schemaRef: { schemaId: 'catalog.product', version: '1.0.0' },
            }],
        })).not.toThrow();
    });

    it('rejects incomplete references and unsupported step types', () => {
        expect(() => validatePipelineDefinition({
            version: 1,
            steps: [{
                key: 'source',
                type: 'EXTRACT',
                config: {},
                schemaRef: { schemaId: '', version: '1.0.0' },
            }],
        })).toThrow(/requires a valid schemaId and version/);
        expect(() => validatePipelineDefinition({
            version: 1,
            steps: [{
                key: 'load',
                type: 'LOAD',
                config: {},
                schemaRef: { schemaId: 'catalog.product', version: '1.0.0' },
            }],
        })).toThrow(/only use schemaRef with EXTRACT or VALIDATE/);
    });

    it('rejects non-object and non-canonical references', () => {
        expect(() => validatePipelineDefinition({
            version: 1,
            steps: [{
                key: 'source',
                type: 'EXTRACT',
                config: {},
                schemaRef: null as never,
            }],
        })).toThrow(/requires a valid schemaId and version/);
        expect(() => validatePipelineDefinition({
            version: 1,
            steps: [{
                key: 'source',
                type: 'EXTRACT',
                config: {},
                schemaRef: { schemaId: '../catalog', version: '1.0.0' },
            }],
        })).toThrow(/requires a valid schemaId and version/);
    });
});
