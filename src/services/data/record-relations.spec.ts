import { describe, expect, it, vi } from 'vitest';
import { RecordErrorService } from './record-error.service';
import { RecordRetryAuditService } from './record-retry-audit.service';

const ctx = { channelId: 17 } as never;

describe('record error GraphQL relation hydration', () => {
    it('loads run and pipeline for record errors', async () => {
        const repository = {
            find: vi.fn().mockResolvedValue([]),
            findOne: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
        };
        const connection = { getRepository: vi.fn(() => repository) };
        const service = new RecordErrorService(
            connection as never,
            {} as never,
            {} as never,
            { createLogger: vi.fn(() => ({})) } as never,
        );

        await service.listByRun(ctx, 'run-1');
        await service.getById(ctx, 'error-1');
        await service.listDeadLetters(ctx);

        const relation = { run: { pipeline: true } };
        expect(repository.find).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ relations: relation }),
        );
        expect(repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'error-1', run: { channelId: '17' } },
                relations: relation,
            }),
        );
        expect(repository.count).toHaveBeenCalledWith({
            where: expect.objectContaining({ run: { channelId: '17' } }),
        });
        expect(repository.find).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ relations: relation }),
        );
    });

    it('loads error, run, and pipeline for retry audits', async () => {
        const repository = { find: vi.fn().mockResolvedValue([]) };
        const service = new RecordRetryAuditService({
            getRepository: vi.fn(() => repository),
        } as never);

        await service.listByError(ctx, 'error-1');

        expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                error: {
                    id: 'error-1',
                    run: { channelId: '17' },
                },
            },
            relations: { error: { run: { pipeline: true } } },
        }));
    });
});

describe('record error transition hooks', () => {
    it('runs ON_RETRY against the immutable run snapshot', async () => {
        const definitionSnapshot = { version: 3, steps: [] };
        const repository = {
            findOne: vi.fn().mockResolvedValue({
                id: 'run-1',
                definitionSnapshot,
                pipeline: { definition: { version: 4, steps: [] } },
            }),
        };
        const hooks = { run: vi.fn().mockResolvedValue(undefined) };
        const service = new RecordErrorService(
            { getRepository: vi.fn(() => repository) } as never,
            hooks as never,
            {} as never,
            { createLogger: vi.fn(() => ({ warn: vi.fn() })) } as never,
        );
        const record = {
            id: 'error-1',
            runId: 'run-1',
            stepKey: 'load',
            payload: { sku: 'SKU-1' },
        };

        await service.notifyRetry(ctx, record as never);

        expect(hooks.run).toHaveBeenCalledWith(
            expect.anything(),
            definitionSnapshot,
            'ON_RETRY',
            undefined,
            record.payload,
            'run-1',
        );
    });

    it('does not fall back to a mutable pipeline definition without a run snapshot', async () => {
        const repository = {
            findOne: vi.fn().mockResolvedValue({
                id: 'run-1',
                definitionSnapshot: null,
                pipeline: { definition: { version: 4, steps: [] } },
            }),
        };
        const hooks = { run: vi.fn() };
        const warn = vi.fn();
        const service = new RecordErrorService(
            { getRepository: vi.fn(() => repository) } as never,
            hooks as never,
            {} as never,
            { createLogger: vi.fn(() => ({ warn })) } as never,
        );

        await service.notifyRetry(ctx, {
            id: 'error-1',
            runId: 'run-1',
            stepKey: 'load',
            payload: { sku: 'SKU-1' },
        } as never);

        expect(hooks.run).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('no immutable definition snapshot'),
            expect.objectContaining({ runId: 'run-1' }),
        );
    });
});
