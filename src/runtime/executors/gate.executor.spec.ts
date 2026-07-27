import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HTTP } from '../../constants';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { GateExecutor } from './gate.executor';
import { getGateCheckpointKeys } from '../gate-checkpoint';

vi.mock('../../utils/secure-fetch.utils', () => ({
    secureFetch: vi.fn(),
}));

function createExecutor() {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    return new GateExecutor(
        {} as never,
        { publishGateApprovalRequested: vi.fn() } as never,
        { createLogger: vi.fn(() => logger) } as never,
    );
}

function createContext(data: Record<string, unknown> = {}) {
    return {
        runId: 'run-1',
        cpData: data,
        markCheckpointDirty: vi.fn(),
    };
}

describe('GateExecutor', () => {
    beforeEach(() => {
        vi.mocked(secureFetch).mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        { approvalType: 'TIMEOUT' },
        { approvalType: 'TIMEOUT', timeoutSeconds: 0 },
        { approvalType: 'THRESHOLD' },
        { approvalType: 'UNKNOWN' },
        { approvalType: 'MANUAL', previewCount: 0 },
    ])('rejects invalid runtime config %#', async config => {
        await expect(createExecutor().execute(
            {} as never,
            { key: 'approval', type: 'GATE', config } as never,
            [{ sku: 'SKU-1' }],
            createContext() as never,
        )).rejects.toThrow();
    });

    it('pauses when the error rate equals the configured threshold', async () => {
        const context = createContext({
            __pipelineStats: { errorCount: 5, successCount: 95 },
        });

        const result = await createExecutor().execute(
            {} as never,
            {
                key: 'approval',
                type: 'GATE',
                config: {
                    approvalType: 'THRESHOLD',
                    errorThresholdPercent: 5,
                },
            } as never,
            [{ sku: 'SKU-1' }],
            context as never,
        );

        expect(result.paused).toBe(true);
        expect(context.cpData).toHaveProperty(
            getGateCheckpointKeys('run-1', 'approval').pending,
        );
    });

    it('stores pending records without a checkpoint deadline for TIMEOUT', async () => {
        const context = createContext();
        const keys = getGateCheckpointKeys('run-1', 'approval');

        await createExecutor().execute(
            {} as never,
            {
                key: 'approval',
                type: 'GATE',
                config: { approvalType: 'TIMEOUT', timeoutSeconds: 30 },
            } as never,
            [{ sku: 'SKU-1' }],
            context as never,
        );

        expect(context.cpData).toHaveProperty(keys.pending);
        expect(Object.keys(context.cpData)).toEqual([keys.pending]);
    });

    it('restores pending records and clears one-time checkpoint keys on resume', async () => {
        const keys = getGateCheckpointKeys('run-1', 'approval');
        const context = createContext({
            [keys.pending]: { pendingRecords: [{ sku: 'SAVED' }] },
            [keys.approved]: true,
            unrelated: 'preserved',
        });

        const result = await createExecutor().execute(
            {} as never,
            {
                key: 'approval',
                type: 'GATE',
                config: { approvalType: 'MANUAL' },
            } as never,
            [],
            context as never,
        );

        expect(result.paused).toBe(false);
        expect(result.pendingRecords).toEqual([{ sku: 'SAVED' }]);
        expect(context.cpData).toEqual({ unrelated: 'preserved' });
        expect(context.markCheckpointDirty).toHaveBeenCalledOnce();
    });

    it('bounds webhook notifications and releases the response body', async () => {
        const cancel = vi.fn(async () => undefined);
        vi.mocked(secureFetch).mockResolvedValue({
            body: { cancel },
            status: 202,
        } as unknown as Response);
        const timeout = vi.spyOn(AbortSignal, 'timeout');

        await createExecutor().execute(
            {} as never,
            {
                key: 'approval',
                type: 'GATE',
                config: {
                    approvalType: 'MANUAL',
                    notifyWebhook: 'https://hooks.example.com/gate',
                },
            } as never,
            [{ sku: 'SKU-1' }],
            createContext() as never,
        );

        await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
        expect(timeout).toHaveBeenCalledWith(HTTP.TIMEOUT_MS);
        expect(secureFetch).toHaveBeenCalledWith(
            'https://hooks.example.com/gate',
            expect.objectContaining({
                method: 'POST',
                signal: expect.any(AbortSignal),
            }),
        );
    });
});
