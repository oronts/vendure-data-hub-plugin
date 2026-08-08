import { describe, expect, it, vi } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import {
    AutoIncrementIdStrategy,
    getIdColumnsFor,
    RequestContext,
    UuidIdStrategy,
    type ID,
    type TransactionalConnection,
} from '@vendure/core';
import { DataHubVersioningResolver } from '../api/resolvers/versioning.resolver';
import { DataHubAnalyticsAdminResolver } from '../api/resolvers/analytics.resolver';
import { DataHubLogAdminResolver } from '../api/resolvers/log.resolver';
import { DataHubConnection, DataHubSecret } from '../entities/config';
import {
    DataHubEventTriggerOutbox,
    Pipeline,
    PipelineLog,
    PipelineRevision,
    PipelineRun,
} from '../entities/pipeline';
import {
    DataHubCheckpoint,
    DataHubRecordError,
    DataHubRecordRetryAudit,
} from '../entities/data';
import type {
    ExportDestinationService,
    FileStorageService,
    PipelineFormatService,
    PipelineLogService,
    WebhookRetryService,
} from '../services';
import { AnalyticsService } from '../services/analytics';
import type { DataHubLoggerFactory } from '../services/logger';
import type {
    ImpactAnalysisService,
    RevisionService,
    RiskAssessmentService,
} from '../services/versioning';
import type { PipelineDefinition } from '../types';

const UUID_PIPELINE_ID = '10000000-0000-4000-8000-000000000001';
const UUID_REVISION_ID = '10000000-0000-4000-8000-000000000002';

const definition: PipelineDefinition = {
    version: 1,
    steps: [],
};

describe('Vendure EntityId compatibility', () => {
    it.each([
        [Pipeline, ['currentRevisionId', 'draftRevisionId']],
        [PipelineRun, ['pipelineId', 'revisionId']],
        [PipelineRevision, ['pipelineId', 'previousRevisionId']],
        [PipelineLog, ['pipelineId', 'runId']],
        [DataHubEventTriggerOutbox, ['pipelineId', 'revisionId', 'runId']],
        [DataHubCheckpoint, ['pipelineId']],
        [DataHubRecordError, ['runId']],
        [DataHubRecordRetryAudit, ['errorId']],
    ] as const)(
        '%s registers every entity reference with @EntityId',
        (entity, expectedFields) => {
            const idColumns = getIdColumnsFor(entity)
                .map((column) => column.name)
                .sort();
            expect(idColumns).toEqual([...expectedFields].sort());
        },
    );

    it('supports both installed Vendure ID strategies', () => {
        expect(new AutoIncrementIdStrategy().primaryKeyType).toBe('increment');
        expect(new UuidIdStrategy().primaryKeyType).toBe('uuid');
    });

    it.each([
        ['connection', DataHubConnection],
        ['pipeline', Pipeline],
        ['secret', DataHubSecret],
    ] as const)(
        'uses only the unique column index for %s codes',
        (_name, entity) => {
            const metadata = getMetadataArgsStorage();
            const codeColumn = metadata.columns.find(
                column => column.target === entity && column.propertyName === 'code',
            );
            const redundantIndices = metadata.indices.filter(
                index => index.target === entity
                    && Array.isArray(index.columns)
                    && index.columns.length === 1
                    && index.columns[0] === 'code',
            );

            expect(codeColumn?.options.unique).toBe(true);
            expect(redundantIndices).toEqual([]);
        },
    );
});

function createResolverFixture() {
    const revision = new PipelineRevision();
    const revisionService = {
        saveDraft: vi.fn(async () => revision),
        publishVersion: vi.fn(async () => revision),
        revertToRevision: vi.fn(async () => revision),
    };
    const resolver = new DataHubVersioningResolver(
        revisionService as unknown as RevisionService,
        {} as ImpactAnalysisService,
        {} as RiskAssessmentService,
        {} as PipelineFormatService,
    );
    const ctx = {
        activeUserId: UUID_REVISION_ID,
        session: undefined,
    } as unknown as RequestContext;
    return { ctx, resolver, revisionService };
}

describe('Versioning GraphQL ID propagation', () => {
    it.each([1, UUID_PIPELINE_ID] satisfies ID[])(
        'preserves pipeline ID %s in save and publish mutations',
        async (pipelineId) => {
            const fixture = createResolverFixture();

            await fixture.resolver.dataHubSaveDraft(fixture.ctx, {
                input: { pipelineId, definition },
            });
            await fixture.resolver.dataHubPublishVersion(fixture.ctx, {
                input: { pipelineId, commitMessage: 'Release', definition },
            });

            expect(fixture.revisionService.saveDraft).toHaveBeenCalledWith(
                fixture.ctx,
                expect.objectContaining({ pipelineId }),
            );
            expect(fixture.revisionService.publishVersion).toHaveBeenCalledWith(
                fixture.ctx,
                expect.objectContaining({ pipelineId }),
            );
        },
    );

    it.each([2, UUID_REVISION_ID] satisfies ID[])(
        'preserves revision ID %s in revert mutations',
        async (revisionId) => {
            const fixture = createResolverFixture();

            await fixture.resolver.dataHubRevertToRevision(fixture.ctx, {
                input: { revisionId, commitMessage: 'Restore' },
            });

            expect(
                fixture.revisionService.revertToRevision,
            ).toHaveBeenCalledWith(
                fixture.ctx,
                expect.objectContaining({ revisionId }),
            );
        },
    );
});

function createAnalyticsFixture(pipelineId: ID) {
    const pipeline = new Pipeline();
    pipeline.id = pipelineId;
    pipeline.code = 'analytics-pipeline';
    pipeline.name = 'Analytics pipeline';

    const pipelineRepository = {
        findOne: vi.fn(async () => pipeline),
    };
    const runRepository = {
        find: vi.fn(async () => []),
    };
    const errorRepository = {
        count: vi.fn(async () => 0),
        find: vi.fn(async () => []),
    };
    const connection = {
        findOneInChannel: vi.fn(async () => pipeline),
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => {
            if (entity === Pipeline) return pipelineRepository;
            if (entity === PipelineRun) return runRepository;
            return errorRepository;
        }),
    };
    const loggerFactory = {
        createLogger: vi.fn(() => ({
            info: vi.fn(),
        })),
    };
    const service = new AnalyticsService(
        connection as unknown as TransactionalConnection,
        loggerFactory as unknown as DataHubLoggerFactory,
    );
    return {
        errorRepository,
        connection,
        pipelineRepository,
        runRepository,
        service,
    };
}

describe('Analytics service EntityId propagation', () => {
    it.each([3, UUID_PIPELINE_ID] satisfies ID[])(
        'preserves pipeline ID %s in repository filters',
        async (pipelineId) => {
            const fixture = createAnalyticsFixture(pipelineId);
            const ctx = { channelId: 1 } as RequestContext;

            const performance = await fixture.service.getPipelinePerformance(
                ctx,
                {
                    pipelineId,
                },
            );
            await fixture.service.getErrorAnalytics(ctx, { pipelineId });
            await fixture.service.getThroughputMetrics(ctx, { pipelineId });

            expect(performance).toEqual([
                expect.objectContaining({
                    pipelineId: String(pipelineId),
                    pipelineCode: 'analytics-pipeline',
                }),
            ]);
            expect(fixture.connection.findOneInChannel).toHaveBeenCalledWith(
                ctx,
                Pipeline,
                pipelineId,
                ctx.channelId,
            );
            expect(fixture.errorRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        run: expect.objectContaining({
                            channelId: '1',
                            pipeline: { id: pipelineId },
                        }),
                    }),
                }),
            );
            expect(fixture.errorRepository.count).toHaveBeenCalledWith({
                where: expect.objectContaining({
                    run: expect.objectContaining({
                        channelId: '1',
                        pipeline: { id: pipelineId },
                    }),
                }),
            });
            expect(fixture.runRepository.find).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        pipeline: { id: pipelineId },
                    }),
                }),
            );
        },
    );
});

describe('Analytics and log GraphQL ID propagation', () => {
    it.each([4, UUID_PIPELINE_ID] satisfies ID[])(
        'passes pipeline ID %s to first-party services without coercion',
        async (pipelineId) => {
            const ctx = {} as RequestContext;
            const analyticsService = {
                getPipelinePerformance: vi.fn(async () => []),
            };
            const analyticsResolver = new DataHubAnalyticsAdminResolver(
                analyticsService as unknown as AnalyticsService,
                {} as WebhookRetryService,
                {} as ExportDestinationService,
                {} as FileStorageService,
            );
            const logService = {
                getRunLogs: vi.fn(async () => []),
                getStats: vi.fn(async () => ({})),
            };
            const logResolver = new DataHubLogAdminResolver(
                logService as unknown as PipelineLogService,
            );

            await analyticsResolver.dataHubPipelinePerformance(ctx, { pipelineId });
            await logResolver.dataHubRunLogs(ctx, { runId: pipelineId });
            await logResolver.dataHubLogStats(ctx, { pipelineId });

            expect(analyticsService.getPipelinePerformance).toHaveBeenCalledWith(
                ctx,
                expect.objectContaining({ pipelineId }),
            );
            expect(logService.getRunLogs).toHaveBeenCalledWith(ctx, pipelineId);
            expect(logService.getStats).toHaveBeenCalledWith(ctx, pipelineId);
        },
    );
});
