import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { ImpactAnalysis } from '../../types';
import type { DataHubLoggerFactory } from '../logger';
import { PipelineRun } from '../../entities/pipeline';
import { RiskAssessmentService } from './risk-assessment.service';
import { TIME_UNITS } from '../../constants';

const impact: ImpactAnalysis = {
    summary: {
        totalRecordsToProcess: 1,
        estimatedSuccessCount: 1,
        estimatedFailureCount: 0,
        estimatedSkipCount: 0,
        affectedEntities: ['Product'],
    },
    entityBreakdown: [{
        entityType: 'Product',
        operations: { create: 1, update: 0, delete: 0, skip: 0, error: 0 },
        fieldChanges: [],
        sampleRecordIds: ['SKU-1'],
    }],
    riskAssessment: { level: 'LOW', score: 0, warnings: [] },
    sampleRecords: [],
    estimatedDuration: {
        estimatedMs: 100,
        confidence: 'LOW',
        extractMs: 25,
        transformMs: 25,
        loadMs: 50,
        basedOn: 'ESTIMATE',
    },
    resourceUsage: null,
    analyzedAt: new Date('2026-07-28T00:00:00.000Z'),
    sampleSize: 1,
    fullDatasetSize: 1,
};

describe('RiskAssessmentService channel context', () => {
    it('uses only active-channel history and a channel-visible pipeline', async () => {
        const count = vi.fn(async () => 0);
        const findOne = vi.fn(async () => null);
        const runRepository = { count, findOne };
        const findOneInChannel = vi.fn(async () => ({
            id: 7,
            definition: { version: 1, steps: [] },
        }));
        const connection = {
            getRepository: vi.fn((_ctx, entity) => {
                if (entity !== PipelineRun) throw new Error('Unexpected repository');
                return runRepository;
            }),
            findOneInChannel,
        } as unknown as TransactionalConnection;
        const loggerFactory = {
            createLogger: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
        } as unknown as DataHubLoggerFactory;
        const service = new RiskAssessmentService(connection, loggerFactory);
        const ctx = { channelId: 'channel-a' } as RequestContext;

        await service.assess(ctx, 7, impact);

        expect(count).toHaveBeenCalledWith({
            where: { pipeline: { id: 7 }, channelId: 'channel-a' },
        });
        expect(findOne).toHaveBeenCalledWith({
            where: { pipeline: { id: 7 }, channelId: 'channel-a' },
            order: { finishedAt: 'DESC' },
        });
        expect(findOneInChannel).toHaveBeenCalledWith(
            ctx,
            expect.any(Function),
            7,
            'channel-a',
        );
    });

    it('reports long durations in the unit named by each warning', async () => {
        const runRepository = {
            count: vi.fn(async () => 1),
            findOne: vi.fn(async () => null),
        };
        const connection = {
            getRepository: vi.fn(() => runRepository),
            findOneInChannel: vi.fn(async () => null),
        } as unknown as TransactionalConnection;
        const loggerFactory = {
            createLogger: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
        } as unknown as DataHubLoggerFactory;
        const service = new RiskAssessmentService(connection, loggerFactory);
        const longImpact: ImpactAnalysis = {
            ...impact,
            estimatedDuration: {
                ...impact.estimatedDuration,
                estimatedMs: 3 * TIME_UNITS.HOUR,
            },
        };

        const assessment = await service.assess(
            { channelId: 'channel-a' } as RequestContext,
            7,
            longImpact,
        );

        expect(assessment.warnings.find(warning => warning.type === 'long-duration'))
            .toMatchObject({
                message: 'Long running pipeline: estimated 180 minutes',
                details: expect.stringContaining('Estimated duration: 180 minutes'),
            });
        expect(assessment.warnings.find(warning => warning.type === 'very-long-duration'))
            .toMatchObject({
                message: 'Very long running pipeline: estimated 3 hours',
                details: expect.stringContaining('Estimated duration: 3 hours'),
            });
    });
});
