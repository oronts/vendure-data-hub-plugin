import { describe, expect, it } from 'vitest';
import { PIPELINE_VALIDATION_ERROR } from '../constants/enums';
import { PIPELINE_DEFINITION_LIMITS } from '../constants/defaults/validation-defaults';
import { GATE_LIMITS } from '../constants/defaults/core-defaults';
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

describe('validatePipelineDefinition gate config', () => {
    it.each([
        GATE_LIMITS.MIN_TIMEOUT_SECONDS,
        GATE_LIMITS.MAX_TIMEOUT_SECONDS,
    ])('accepts TIMEOUT gate duration %s', timeoutSeconds => {
        expect(() => validatePipelineDefinition(definitionWithGate({
            approvalType: 'TIMEOUT',
            timeoutSeconds,
        }))).not.toThrow();
    });

    it.each([
        {},
        { approvalType: 'AUTOMATIC' },
        { approvalType: 'TIMEOUT' },
        { approvalType: 'TIMEOUT', timeoutSeconds: 0 },
        { approvalType: 'TIMEOUT', timeoutSeconds: -1 },
        { approvalType: 'TIMEOUT', timeoutSeconds: 1.5 },
        {
            approvalType: 'TIMEOUT',
            timeoutSeconds: GATE_LIMITS.MAX_TIMEOUT_SECONDS + 1,
        },
        { approvalType: 'TIMEOUT', timeoutSeconds: '30' },
        { approvalType: 'THRESHOLD' },
        { approvalType: 'THRESHOLD', errorThresholdPercent: -0.1 },
        { approvalType: 'THRESHOLD', errorThresholdPercent: 100.1 },
        { approvalType: 'MANUAL', previewCount: 0 },
        { approvalType: 'MANUAL', previewCount: 1.5 },
        {
            approvalType: 'MANUAL',
            previewCount: GATE_LIMITS.MAX_PREVIEW_COUNT + 1,
        },
        { approvalType: 'MANUAL', notifyEmail: 'invalid' },
        { approvalType: 'MANUAL', notifyWebhook: 'file:///tmp/hook' },
    ])('rejects invalid gate config %#', config => {
        expectValidationError(
            definitionWithGate(config),
            PIPELINE_VALIDATION_ERROR.INVALID_GATE_CONFIG,
        );
    });
});

describe('validatePipelineDefinition step keys', () => {
    it('rejects whitespace-only step keys', () => {
        expectValidationError(
            {
                version: 1,
                steps: [{ key: '   ', type: 'EXTRACT', config: {} }],
            } as PipelineDefinition,
            PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
        );
    });
});

describe('validatePipelineDefinition step shape', () => {
    it('rejects array-valued step config', () => {
        expectValidationError(
            {
                version: 1,
                steps: [{ key: 'extract', type: 'EXTRACT', config: [] }],
            } as unknown as PipelineDefinition,
            PIPELINE_VALIDATION_ERROR.MISSING_CONFIG,
        );
    });

    it.each([1, 1.5, '2'])(
        'rejects dead top-level concurrency value %s',
        concurrency => {
            expectValidationError(
                {
                    version: 1,
                    steps: [{
                        key: 'extract',
                        type: 'EXTRACT',
                        config: {},
                        concurrency,
                    }],
                } as unknown as PipelineDefinition,
                PIPELINE_VALIDATION_ERROR.INVALID_CONCURRENCY,
            );
        },
    );
});

describe('validatePipelineDefinition graph input', () => {
    it('reports a non-array edge collection through the validation contract', () => {
        expectValidationError(
            {
                version: 1,
                steps: [{ key: 'extract', type: 'EXTRACT', config: {} }],
                edges: { from: 'extract', to: 'load' },
            } as unknown as PipelineDefinition,
            PIPELINE_VALIDATION_ERROR.INVALID_EDGE,
        );
    });

    it('reports a malformed edge through the validation contract', () => {
        const definition = {
            version: 1,
            steps: [{ key: 'extract', type: 'EXTRACT', config: {} }],
            edges: [null],
        } as unknown as PipelineDefinition;

        try {
            validatePipelineDefinition(definition);
            throw new Error('Expected validation to fail');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(PipelineDefinitionError);
            expect((error as PipelineDefinitionError).issues[0]).toEqual({
                message: 'Invalid edge entry',
                errorCode: PIPELINE_VALIDATION_ERROR.INVALID_EDGE,
                stepKey: undefined,
                field: 'edges[0]',
            });
        }
    });

    it('reports object-valued route branches without leaking a TypeError', () => {
        const definition = {
            version: 1,
            steps: [
                {
                    key: 'route',
                    type: 'ROUTE',
                    config: { branches: { name: 'matched' } },
                },
                { key: 'load', type: 'LOAD', config: {} },
            ],
            edges: [{ from: 'route', to: 'load', branch: 'matched' }],
        } as unknown as PipelineDefinition;

        expectValidationError(
            definition,
            PIPELINE_VALIDATION_ERROR.ROUTE_MISSING_BRANCHES,
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

function definitionWithGate(config: Record<string, unknown>): PipelineDefinition {
    return {
        version: 1,
        steps: [
            { key: 'extract', type: 'EXTRACT', config: {} },
            { key: 'approval', type: 'GATE', config },
        ],
    } as PipelineDefinition;
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
