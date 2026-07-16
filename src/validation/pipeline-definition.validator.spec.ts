import { describe, expect, it } from 'vitest';
import { PIPELINE_VALIDATION_ERROR } from '../constants/enums';
import type { PipelineDefinition } from '../types';
import { PipelineDefinitionError } from './pipeline-definition-error';
import { validatePipelineDefinition } from './pipeline-definition.validator';

function definitionWithVersion(version: unknown): PipelineDefinition {
    return { version, steps: [] } as unknown as PipelineDefinition;
}

describe('validatePipelineDefinition version contract', () => {
    it('accepts a positive integer without mutating a frozen definition', () => {
        const definition = Object.freeze({
            version: 1,
            steps: Object.freeze([]),
        }) as unknown as PipelineDefinition;

        expect(() => validatePipelineDefinition(definition)).not.toThrow();
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1']) (
        'rejects non-positive-integer schema version %s',
        version => {
            try {
                validatePipelineDefinition(definitionWithVersion(version));
                throw new Error('Expected validation to fail');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(PipelineDefinitionError);
                const validationError = error as PipelineDefinitionError;
                expect(validationError.issues).toContainEqual(expect.objectContaining({
                    errorCode: PIPELINE_VALIDATION_ERROR.INVALID_VERSION,
                    field: 'version',
                }));
            }
        },
    );
});
