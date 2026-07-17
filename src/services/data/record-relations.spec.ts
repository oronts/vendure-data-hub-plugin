import { describe, expect, it, vi } from 'vitest';
import { RecordErrorService } from './record-error.service';
import { RecordRetryAuditService } from './record-retry-audit.service';

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

        await service.listByRun({} as never, 'run-1');
        await service.getById({} as never, 'error-1');
        await service.listDeadLetters({} as never);

        const relation = { run: { pipeline: true } };
        expect(repository.find).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ relations: relation }),
        );
        expect(repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ relations: relation }),
        );
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

        await service.listByError({} as never, 'error-1');

        expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({
            relations: { error: { run: { pipeline: true } } },
        }));
    });
});
