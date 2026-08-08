import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { RunStatus } from '../../constants';
import type { PipelineRun } from '../../entities/pipeline';
import type { DomainEventsService } from '../events/domain-events.service';
import type { DataHubLoggerFactory, ExecutionLogger } from '../logger';
import type { DistributedLockService } from '../runtime/distributed-lock.service';
import type { DefinitionValidationService } from '../validation/definition-validation.service';
import { PipelineRunnerService } from './pipeline-runner.service';

describe('PipelineRunnerService duplicate queue delivery', () => {
    it('leaves the shared pending run intact when another worker owns its execution lock', async () => {
        const run = {
            id: 42,
            status: RunStatus.PENDING,
            pipeline: { id: 7, code: 'catalog-sync' },
            channelId: '17',
            channelToken: 'private-channel',
            startedByUserId: '1',
            revisionId: 9,
            definitionSnapshot: { version: 1, steps: [], edges: [] },
        } as unknown as PipelineRun;
        const runRepo = {
            findOne: vi.fn(async () => run),
            count: vi.fn(async () => 0),
            save: vi.fn(),
            update: vi.fn(),
        };
        const connection = {
            getRepository: vi.fn(() => runRepo),
        };
        const requestContextService = {
            create: vi.fn(async () => ({
                channelId: 17,
                channel: { token: 'private-channel' },
            } as RequestContext)),
        };
        const executionUser = { id: 1 };
        const userService = {
            getUserById: vi.fn(async () => executionUser),
        };
        const logger = {
            withContext: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
        };
        logger.withContext.mockReturnValue(logger);
        const loggerFactory = { createLogger: vi.fn(() => logger) };
        const distributedLock = {
            acquire: vi.fn(async () => ({ acquired: false, currentOwner: 'worker-a' })),
        };
        const runner = new PipelineRunnerService(
            connection as unknown as TransactionalConnection,
            requestContextService as unknown as RequestContextService,
            userService as never,
            {} as never,
            {} as DefinitionValidationService,
            {} as DomainEventsService,
            loggerFactory as unknown as DataHubLoggerFactory,
            {} as ExecutionLogger,
            {} as never,
            {} as never,
            distributedLock as unknown as DistributedLockService,
        );

        await expect(runner.execute(42, { attempt: 1, maxAttempts: 3 })).resolves.toBeUndefined();

        expect(run.status).toBe(RunStatus.PENDING);
        expect(runRepo.save).not.toHaveBeenCalled();
        expect(runRepo.update).not.toHaveBeenCalled();
        expect(requestContextService.create).toHaveBeenNthCalledWith(1, {
            apiType: 'admin',
        });
        expect(requestContextService.create).toHaveBeenNthCalledWith(2, {
            apiType: 'admin',
            channelOrToken: 'private-channel',
            user: executionUser,
        });
        expect(distributedLock.acquire).toHaveBeenCalledOnce();
    });
});
