import { describe, expect, it } from 'vitest';
import type { PipelineDefinition } from '../../types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { FIELD_LIMITS, PARALLEL_EXECUTION } from '../../constants';
import { THROUGHPUT_LIMITS } from '../../../shared/constants';
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
    it.each([0, -1, 1.5, PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS + 1])(
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

    it('returns the exact field path for invalid parallel settings', () => {
        expect(validate({ maxConcurrentSteps: 0 })).toEqual([
            expect.objectContaining({
                field: 'context.parallelExecution.maxConcurrentSteps',
            }),
        ]);
    });
});

describe('validateContext error handling', () => {
    it('accepts bounded retry settings', () => {
        const issues: PipelineDefinitionIssue[] = [];
        validateContext({
            version: 1,
            steps: [],
            context: {
                errorHandling: {
                    maxRetries: 3,
                    retryDelayMs: 100,
                    maxRetryDelayMs: 1_000,
                    backoffMultiplier: 2,
                },
            },
        } as PipelineDefinition, issues);

        expect(issues).toEqual([]);
    });

    it('rejects unbounded and inconsistent retry settings with exact paths', () => {
        const issues: PipelineDefinitionIssue[] = [];
        validateContext({
            version: 1,
            steps: [],
            context: {
                errorHandling: {
                    maxRetries: 11,
                    retryDelayMs: 2_000,
                    maxRetryDelayMs: 1_000,
                    backoffMultiplier: 11,
                },
            },
        } as PipelineDefinition, issues);

        expect(issues.map(issue => issue.field)).toEqual([
            'context.errorHandling.maxRetries',
            'context.errorHandling.backoffMultiplier',
            'context.errorHandling.maxRetryDelayMs',
        ]);
    });

    it('rejects a non-object retry config', () => {
        const issues: PipelineDefinitionIssue[] = [];
        validateContext({
            version: 1,
            steps: [],
            context: { errorHandling: 'retry' as never },
        } as PipelineDefinition, issues);

        expect(issues).toEqual([expect.objectContaining({
            field: 'context.errorHandling',
        })]);
    });
});

describe('validateContext removed run modes', () => {
    it.each(['SYNC', 'ASYNC', 'BATCH'])('rejects removed %s mode', runMode => {
        const issues: PipelineDefinitionIssue[] = [];
        validateContext({
            version: 1,
            steps: [],
            context: { runMode },
        } as unknown as PipelineDefinition, issues);

        expect(issues).toEqual([expect.objectContaining({
            message: 'context.runMode is not supported',
            field: 'context.runMode',
        })]);
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
            'context.runMode is not supported',
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

describe('validateContext step overrides', () => {
    function validateDefinition(
        definition: PipelineDefinition,
    ): PipelineDefinitionIssue[] {
        const issues: PipelineDefinitionIssue[] = [];
        validateContext(definition, issues);
        return issues;
    }

    it('accepts a complete explicit-channel override', () => {
        expect(validateDefinition({
            version: 1,
            steps: [{
                key: 'load',
                type: 'LOAD',
                config: {},
                context: {
                    contentLanguage: 'de',
                    channelStrategy: 'EXPLICIT',
                    channelIds: ['channel-1'],
                    validationMode: 'STRICT',
                },
            }],
        } as PipelineDefinition)).toEqual([]);
    });

    it('inherits pipeline channel IDs for a step strategy override', () => {
        expect(validateDefinition({
            version: 1,
            context: { channelIds: ['channel-1'] },
            steps: [{
                key: 'load',
                type: 'LOAD',
                config: {},
                context: { channelStrategy: 'MULTI' },
            }],
        } as PipelineDefinition)).toEqual([]);
    });

    it('rejects invalid context values and missing explicit channels', () => {
        const issues = validateDefinition({
            version: 1,
            steps: [{
                key: 'load',
                type: 'LOAD',
                config: {},
                context: {
                    contentLanguage: '',
                    channelStrategy: 'EXPLICIT',
                    channelIds: [],
                    validationMode: 'IGNORE' as never,
                    runMode: 'STREAM',
                },
            }],
        } as unknown as PipelineDefinition);

        expect(issues.map(issue => issue.message)).toEqual([
            'steps.load.context.runMode is not supported',
            'steps.load.context.validationMode must be STRICT or LENIENT',
            'steps.load.context.contentLanguage must be a non-empty language code',
            'steps.load.context.channelIds is required for EXPLICIT channel strategy',
        ]);
        expect(issues.map(issue => issue.field)).toEqual([
            'steps.load.context.runMode',
            'steps.load.context.validationMode',
            'steps.load.context.contentLanguage',
            'steps.load.context.channelIds',
        ]);
    });

    it('validates pipeline identifiers and accepts supported throughput settings', () => {
        expect(validateDefinition({
            version: 1,
            context: {
                channel: 'default-channel-token',
                idempotencyKeyField: 'sku',
                throughput: {
                    rateLimitRps: 0,
                    batchSize: 100,
                    concurrency: 4,
                    pauseOnErrorRate: { threshold: 0.25, intervalSec: 30 },
                    drainStrategy: 'QUEUE',
                },
            },
            steps: [{
                key: 'load',
                type: 'LOAD',
                config: {},
                throughput: { batchSize: 25, concurrency: 2 },
            }],
        } as PipelineDefinition)).toEqual([]);
    });

    it('rejects malformed identifiers and throughput values with exact paths', () => {
        const issues = validateDefinition({
            version: 1,
            context: {
                channel: ' ',
                idempotencyKeyField: '',
                throughput: {
                    rateLimitRps: -1,
                    batchSize: 1.5,
                    concurrency: 0,
                    pauseOnErrorRate: { threshold: 2, intervalSec: 0 },
                    drainStrategy: 'DROP' as never,
                },
            },
            steps: [{
                key: 'load',
                type: 'LOAD',
                config: {},
                throughput: { batchSize: Number.NaN },
                context: {
                    throughput: { rateLimitRps: Number.POSITIVE_INFINITY },
                },
            }],
        } as PipelineDefinition);

        expect(issues.map(issue => issue.field)).toEqual([
            'context.channel',
            'context.idempotencyKeyField',
            'context.throughput.rateLimitRps',
            'context.throughput.batchSize',
            'context.throughput.concurrency',
            'context.throughput.drainStrategy',
            'context.throughput.pauseOnErrorRate.threshold',
            'context.throughput.pauseOnErrorRate.intervalSec',
            'steps.load.throughput.batchSize',
            'steps.load.context.throughput.rateLimitRps',
        ]);
    });
    it('rejects resource-amplifying throughput values', () => {
        const issues: PipelineDefinitionIssue[] = [];
        validateContext({
            version: 1,
            steps: [],
            context: {
                throughput: {
                    rateLimitRps: THROUGHPUT_LIMITS.MAX_RATE_LIMIT_RPS + 1,
                    batchSize: FIELD_LIMITS.BATCH_SIZE_MAX + 1,
                    concurrency: PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS + 1,
                    pauseOnErrorRate: {
                        threshold: 0,
                        intervalSec: THROUGHPUT_LIMITS.MAX_PAUSE_INTERVAL_SEC + 1,
                    },
                },
            },
        } as PipelineDefinition, issues);

        expect(issues.map(issue => issue.field)).toEqual([
            'context.throughput.rateLimitRps',
            'context.throughput.batchSize',
            'context.throughput.concurrency',
            'context.throughput.pauseOnErrorRate.threshold',
            'context.throughput.pauseOnErrorRate.intervalSec',
        ]);
    });
});
