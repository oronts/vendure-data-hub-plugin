import { describe, expect, it } from 'vitest';
import { PIPELINE_VALIDATION_ERROR } from '../constants';
import type { PipelineDefinition } from '../types';
import { PipelineDefinitionError } from './pipeline-definition-error';
import { validatePipelineDefinition } from './pipeline-definition.validator';

function definitionWithRules(rules: unknown): PipelineDefinition {
    return {
        version: 1,
        steps: [
            { key: 'source', type: 'EXTRACT', config: {} },
            { key: 'validate', type: 'VALIDATE', config: { rules } },
        ],
    } as PipelineDefinition;
}

function expectInvalidRules(rules: unknown): void {
    try {
        validatePipelineDefinition(definitionWithRules(rules));
        throw new Error('Expected validation to fail');
    } catch (error: unknown) {
        expect(error).toBeInstanceOf(PipelineDefinitionError);
        expect((error as PipelineDefinitionError).issues[0]).toMatchObject({
            errorCode: PIPELINE_VALIDATION_ERROR.INVALID_VALIDATION_RULE,
            stepKey: 'validate',
            field: 'steps[1].config.rules',
        });
    }
}

describe('inline validation rule contract', () => {
    it('accepts the complete runtime-supported business rule shape', () => {
        expect(() => validatePipelineDefinition(definitionWithRules([{
            type: 'business',
            spec: {
                field: 'product.price',
                required: true,
                type: 'number',
                min: 0,
                max: 100,
                minLength: 0,
                maxLength: 10,
                pattern: '^.+$',
                enum: [0, 50, 100],
                error: 'Invalid price',
            },
        }]))).not.toThrow();
    });

    it.each([
        null,
        {},
        [{ type: 'schema', spec: { field: 'sku', required: true } }],
        [{ type: 'ref', spec: { field: 'sku', required: true } }],
        [{ type: 'business', spec: { field: ' sku', required: true } }],
        [{ type: 'business', spec: { field: 'sku', test: { op: 'present' } } }],
        [{ type: 'business', spec: { field: 'sku', oneOf: ['A'] } }],
        [{ type: 'business', spec: { field: 'sku', min: 2, max: 1 } }],
        [{ type: 'business', spec: { field: 'sku', minLength: 1.5 } }],
        [{ type: 'business', spec: { field: 'sku', enum: [] } }],
    ])('rejects unsupported or malformed rules %#', rules => {
        expectInvalidRules(rules);
    });
});
