import { describe, expect, it, vi } from 'vitest';
import type {
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { RunStatus } from '../../constants';
import type { PipelineRun } from '../../entities/pipeline';
import type { DomainEventsService } from '../events/domain-events.service';
import type { DataHubLoggerFactory, ExecutionLogger } from '../logger';
import type { DefinitionValidationService } from '../validation/definition-validation.service';
import { PipelineRunnerService } from './pipeline-runner.service';

function createFixture() {
    const run = {
        id: 42,
        status: RunStatus.PENDING,
        finishedAt: null,
        error: null,
        pipeline: { id: 7, code: 'catalog-sync' },
        channelId: null,
        channelToken: null,
        revisionId: 9,
        definitionSnapshot: { version: 1, steps: [], edges: [] },
    } as unknown as PipelineRun;
    const runRepo = {
        findOne: vi.fn(async () => run),
        save: vi.fn(async (entity: PipelineRun) => entity),
    };
    const connection = {
        getRepository: vi.fn(() => runRepo),
    };
    const requestContextService = {
        create: vi.fn(async () => ({ channelId: 1 } as RequestContext)),
    };
    const logger = {
        withContext: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    logger.withContext.mockReturnValue(logger);
    const domainEvents = { publishRunFailed: vi.fn() };
    const runner = new PipelineRunnerService(
        connection as unknown as TransactionalConnection,
        requestContextService as unknown as RequestContextService,
        { getUserById: vi.fn() } as never,
        {} as never,
        {} as DefinitionValidationService,
        domainEvents as unknown as DomainEventsService,
        { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
        {} as ExecutionLogger,
        {} as never,
        {} as never,
    );

    return { domainEvents, logger, run, runRepo, runner };
}

describe('PipelineRunnerService execution channel', () => {
    it('retries without executing when channel metadata cannot be restored', async () => {
        const fixture = createFixture();

        await expect(fixture.runner.execute(42, {
            attempt: 1,
            maxAttempts: 3,
        })).rejects.toThrow('Pipeline run 42 has no persisted execution channel');

        expect(fixture.run.status).toBe(RunStatus.PENDING);
        expect(fixture.runRepo.save).not.toHaveBeenCalled();
        expect(fixture.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Cannot restore pipeline execution channel'),
            expect.objectContaining({ attempt: 1, maxAttempts: 3 }),
        );
    });

    it('fails closed after the final restore attempt', async () => {
        const fixture = createFixture();

        await expect(fixture.runner.execute(42, {
            attempt: 3,
            maxAttempts: 3,
        })).resolves.toBeUndefined();

        expect(fixture.run.status).toBe(RunStatus.FAILED);
        expect(fixture.run.finishedAt).toBeInstanceOf(Date);
        expect(fixture.run.error).toContain('has no persisted execution channel');
        expect(fixture.runRepo.save).toHaveBeenCalledOnce();
        expect(fixture.domainEvents.publishRunFailed).toHaveBeenCalledWith(
            '42',
            'catalog-sync',
            fixture.run.error,
        );
    });
});
