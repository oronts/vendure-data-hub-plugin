import { describe, expect, it } from 'vitest';
import type { PipelineDefinition } from '../../types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { validateCapabilities, validateContext } from './context-validation';

function validate(parallelExecution: unknown): PipelineDefinitionIssue[] {
    const issues: PipelineDefinitionIssue[] = [];
    validateContext({
        version: 1,
        steps: [],
        context: {
            parallelExecution,
        },
    } as PipelineDefinition, issues);
    return issues;
}

describe('validateContext parallel execution', () => {
    it.each([0, -1, 1.5, 17])(
        'rejects unsafe maxConcurrentSteps value %s',
        maxConcurrentSteps => {
            expect(validate({ maxConcurrentSteps })).toEqual([
                expect.objectContaining({
                    errorCode: 'context-invalid',
                    message: expect.stringContaining('maxConcurrentSteps'),
                }),
            ]);
        },
    );

    it('rejects invalid flags and error policies', () => {
        const issues = validate({
            enabled: 'yes',
            errorPolicy: 'IGNORE',
        });
        expect(issues).toHaveLength(2);
    });

    it('accepts bounded parallel execution configuration', () => {
        expect(validate({
            enabled: true,
            maxConcurrentSteps: 8,
            errorPolicy: 'FAIL_FAST',
        })).toEqual([]);
    });
});

describe('validateContext run modes', () => {
    it.each(['SYNC', 'ASYNC', 'BATCH'])('accepts supported %s mode', runMode => {
        const issues: PipelineDefinitionIssue[] = [];
        validateContext({
            version: 1,
            steps: [],
            context: { runMode },
        } as PipelineDefinition, issues);

        expect(issues).toEqual([]);
    });

    it('rejects unsupported streaming fields in raw definitions', () => {
        const issues: PipelineDefinitionIssue[] = [];
        validateContext({
            version: 1,
            steps: [],
            context: {
                runMode: 'STREAM',
                lateEvents: { policy: 'BUFFER', bufferMs: 1000 },
                watermarkMs: 5000,
            },
        } as unknown as PipelineDefinition, issues);

        expect(issues.map(issue => issue.message)).toEqual([
            'context.runMode must be SYNC, ASYNC, or BATCH',
            'context.lateEvents is not supported',
            'context.watermarkMs is not supported',
        ]);
    });

    it('rejects the removed streamSafe capability', () => {
        const issues: PipelineDefinitionIssue[] = [];
        validateCapabilities({
            version: 1,
            steps: [],
            capabilities: { streamSafe: true },
        } as unknown as PipelineDefinition, issues);

        expect(issues).toEqual([expect.objectContaining({
            message: 'capabilities.streamSafe is not supported',
        })]);
    });
});
