import { describe, expect, it } from 'vitest';
import { PIPELINE_VALIDATION_ERROR } from '../constants/enums';
import { PIPELINE_DEFINITION_LIMITS } from '../constants/defaults/validation-defaults';
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

describe('validatePipelineDefinition resource limits', () => {
    it('accepts a definition at the maximum nesting depth', () => {
        const definition = definitionWithConfigDepth(
            PIPELINE_DEFINITION_LIMITS.MAX_DEPTH,
        );

        expect(() => validatePipelineDefinition(definition)).not.toThrow();
    });

    it('rejects a definition beyond the maximum nesting depth', () => {
        expectValidationError(
            definitionWithConfigDepth(PIPELINE_DEFINITION_LIMITS.MAX_DEPTH + 1),
            PIPELINE_VALIDATION_ERROR.DEFINITION_TOO_DEEP,
        );
    });

    it('rejects a definition above the serialized byte limit', () => {
        const definition = {
            version: 1,
            steps: [{
                key: 'extract',
                type: 'EXTRACT',
                config: { value: 'x'.repeat(PIPELINE_DEFINITION_LIMITS.MAX_BYTES) },
            }],
        } as unknown as PipelineDefinition;

        expectValidationError(
            definition,
            PIPELINE_VALIDATION_ERROR.DEFINITION_TOO_LARGE,
        );
    });

    it('rejects circular code-first definitions', () => {
        const config: Record<string, unknown> = {};
        config.self = config;
        const definition = {
            version: 1,
            steps: [{ key: 'extract', type: 'EXTRACT', config }],
        } as unknown as PipelineDefinition;

        expectValidationError(
            definition,
            PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
        );
    });

    it('accepts repeated non-circular object references', () => {
        const shared = { value: 'shared' };
        const definition = {
            version: 1,
            steps: [{
                key: 'extract',
                type: 'EXTRACT',
                config: { first: shared, second: shared },
            }],
        } as unknown as PipelineDefinition;

        expect(() => validatePipelineDefinition(definition)).not.toThrow();
    });

    it.each([undefined, () => undefined, Symbol('value'), Number.NaN])(
        'rejects lossy non-JSON config value %s',
        value => {
            const definition = {
                version: 1,
                steps: [{ key: 'extract', type: 'EXTRACT', config: { value } }],
            } as unknown as PipelineDefinition;

            expectValidationError(
                definition,
                PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
            );
        },
    );

    it('rejects a throwing code-first property getter', () => {
        const config = Object.defineProperty({}, 'value', {
            enumerable: true,
            get: () => {
                throw new Error('getter failed');
            },
        });
        const definition = {
            version: 1,
            steps: [{ key: 'extract', type: 'EXTRACT', config }],
        } as unknown as PipelineDefinition;

        expectValidationError(
            definition,
            PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
        );
    });

    it('rejects non-JSON object instances', () => {
        const definition = {
            version: 1,
            steps: [{ key: 'extract', type: 'EXTRACT', config: { value: new Date() } }],
        } as unknown as PipelineDefinition;

        expectValidationError(
            definition,
            PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
        );
    });
});

function definitionWithConfigDepth(targetDepth: number): PipelineDefinition {
    let config: Record<string, unknown> = {};
    const configDepth = 4;
    for (let depth = configDepth; depth < targetDepth; depth++) {
        config = { nested: config };
    }
    return {
        version: 1,
        steps: [{ key: 'extract', type: 'EXTRACT', config }],
    } as unknown as PipelineDefinition;
}

function expectValidationError(
    definition: PipelineDefinition,
    errorCode: string,
): void {
    try {
        validatePipelineDefinition(definition);
        throw new Error('Expected validation to fail');
    } catch (error: unknown) {
        expect(error).toBeInstanceOf(PipelineDefinitionError);
        expect((error as PipelineDefinitionError).issues).toContainEqual(
            expect.objectContaining({ errorCode }),
        );
    }
}
