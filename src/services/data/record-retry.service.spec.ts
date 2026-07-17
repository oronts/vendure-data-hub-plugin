import { describe, expect, it, vi } from 'vitest';
import { PipelineDefinition, StepType } from '../../types';
import {
    RECORD_RETRY_OUTCOME,
    RecordRetryService,
    resolveStepAdapterCode,
} from './record-retry.service';

const snapshotDefinition: PipelineDefinition = {
    version: 7,
    steps: [{
        key: 'load-products',
        type: StepType.LOAD,
        config: { adapterCode: 'productUpsert' },
    }],
};

function createFixture(options?: {
    replayResult?: { processed: number; succeeded: number; failed: number };
    record?: Record<string, unknown> | null;
    definition?: PipelineDefinition;
    auditError?: Error;
}) {
    const record = options?.record === undefined
        ? {
            id: 11,
            runId: 22,
            stepKey: 'load-products',
            payload: { sku: 'SKU-1', name: 'Old name' },
        }
        : options.record;
    const definition = options?.definition ?? snapshotDefinition;
    const run = {
        id: 22,
        definitionSnapshot: definition,
        pipeline: {
            id: 33,
            definition: {
                version: 99,
                steps: [],
            },
        },
    };
    const recordErrors = {
        getById: vi.fn().mockResolvedValue(record),
    };
    const errorReplay = {
        replayRecord: vi.fn().mockResolvedValue(
            options?.replayResult ?? { processed: 1, succeeded: 1, failed: 0 },
        ),
    };
    const runRepository = {
        findOne: vi.fn().mockResolvedValue(run),
    };
    const connection = {
        getRepository: vi.fn(() => runRepository),
    };
    const retryAudits = {
        record: options?.auditError
            ? vi.fn().mockRejectedValue(options.auditError)
            : vi.fn().mockResolvedValue({ id: 44 }),
    };
    const logger = {
        warn: vi.fn(),
    };
    const service = new RecordRetryService(
        recordErrors as never,
        errorReplay as never,
        connection as never,
        retryAudits as never,
        { createLogger: vi.fn(() => logger) } as never,
    );

    return {
        service,
        recordErrors,
        errorReplay,
        runRepository,
        retryAudits,
        logger,
        run,
    };
}

describe('resolveStepAdapterCode', () => {
    it('prefers the canonical nested adapter code and supports the typed root field', () => {
        expect(resolveStepAdapterCode({
            key: 'load',
            type: StepType.LOAD,
            adapterCode: 'rootAdapter',
            config: { adapterCode: 'nestedAdapter' },
        })).toBe('nestedAdapter');
        expect(resolveStepAdapterCode({
            key: 'load',
            type: StepType.LOAD,
            adapterCode: 'rootAdapter',
            config: {},
        })).toBe('rootAdapter');
    });
});

describe('RecordRetryService', () => {
    it('replays the run snapshot with an allowed patch and returns the applied diff', async () => {
        const fixture = createFixture();

        const result = await fixture.service.retry(
            {} as never,
            11,
            { sku: 'SKU-2', name: 'New name' },
        );

        expect(result).toEqual(expect.objectContaining({
            success: true,
            outcome: RECORD_RETRY_OUTCOME.APPLIED,
            errorId: 11,
            runId: 22,
            stepKey: 'load-products',
            adapterCode: 'productUpsert',
            definitionVersion: 7,
            appliedPatch: { sku: 'SKU-2', name: 'New name' },
            rejectedPatchKeys: [],
            processed: 1,
            succeeded: 1,
            failed: 0,
            auditId: 44,
            auditRecorded: true,
        }));
        expect(fixture.errorReplay.replayRecord).toHaveBeenCalledWith(
            expect.anything(),
            snapshotDefinition,
            'load-products',
            { sku: 'SKU-2', name: 'New name' },
        );
        expect(fixture.retryAudits.record).toHaveBeenCalledOnce();
    });

    it('resolves a root adapter code when the canonical config has none', async () => {
        const fixture = createFixture({
            definition: {
                version: 7,
                steps: [{
                    key: 'load-products',
                    type: StepType.LOAD,
                    adapterCode: 'productUpsert',
                    config: {},
                }],
            },
        });

        const result = await fixture.service.retry(
            {} as never,
            11,
            { sku: 'SKU-2' },
        );

        expect(result.success).toBe(true);
        expect(result.adapterCode).toBe('productUpsert');
    });

    it('rejects the whole patch when any field is not allowed', async () => {
        const fixture = createFixture();

        const result = await fixture.service.retry(
            {} as never,
            11,
            { sku: 'SKU-2', internalToken: 'secret' },
        );

        expect(result).toEqual(expect.objectContaining({
            success: false,
            outcome: RECORD_RETRY_OUTCOME.PATCH_REJECTED,
            appliedPatch: {},
            rejectedPatchKeys: ['internalToken'],
        }));
        expect(fixture.errorReplay.replayRecord).not.toHaveBeenCalled();
        expect(fixture.retryAudits.record).not.toHaveBeenCalled();
    });

    it.each([
        { processed: 1, succeeded: 0, failed: 1 },
        { processed: 0, succeeded: 0, failed: 0 },
    ])('does not audit a replay without a successful side effect: %j', async replayResult => {
        const fixture = createFixture({ replayResult });

        const result = await fixture.service.retry({} as never, 11);

        expect(result).toEqual(expect.objectContaining({
            success: false,
            outcome: RECORD_RETRY_OUTCOME.REPLAY_FAILED,
            ...replayResult,
        }));
        expect(fixture.retryAudits.record).not.toHaveBeenCalled();
    });

    it('returns a typed not-found outcome without querying the run', async () => {
        const fixture = createFixture({ record: null });

        const result = await fixture.service.retry({} as never, 11);

        expect(result).toEqual(expect.objectContaining({
            success: false,
            outcome: RECORD_RETRY_OUTCOME.RECORD_NOT_FOUND,
        }));
        expect(fixture.runRepository.findOne).not.toHaveBeenCalled();
    });

    it('reports successful replay separately from audit persistence failure', async () => {
        const fixture = createFixture({ auditError: new Error('audit unavailable') });

        const result = await fixture.service.retry({} as never, 11);

        expect(result).toEqual(expect.objectContaining({
            success: true,
            outcome: RECORD_RETRY_OUTCOME.APPLIED,
            auditId: null,
            auditRecorded: false,
        }));
        expect(fixture.logger.warn).toHaveBeenCalledOnce();
    });
});
