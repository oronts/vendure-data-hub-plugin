import { describe, expect, it, vi } from 'vitest';
import { Brackets } from 'typeorm';
import type {
    ListQueryBuilder,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { LogLevel } from '../../constants/enums';
import { PipelineLogService } from './pipeline-log.service';

function createQueryBuilder() {
    const query = {
        alias: 'log',
        leftJoin: vi.fn(),
        leftJoinAndSelect: vi.fn(),
        andWhere: vi.fn(),
        select: vi.fn(),
        addSelect: vi.fn(),
        groupBy: vi.fn(),
        orderBy: vi.fn(),
        skip: vi.fn(),
        take: vi.fn(),
        getManyAndCount: vi.fn(async () => [[], 0]),
        getMany: vi.fn(async () => []),
        getCount: vi.fn(async () => 0),
        getRawMany: vi.fn(async () => []),
        getRawOne: vi.fn(async () => ({ avg: 0 })),
    };
    for (const method of [
        query.leftJoin,
        query.leftJoinAndSelect,
        query.andWhere,
        query.select,
        query.addSelect,
        query.groupBy,
        query.orderBy,
        query.skip,
        query.take,
    ]) {
        method.mockReturnValue(query);
    }
    return query;
}

function createFixture() {
    const listQuery = createQueryBuilder();
    const repositoryQuery = createQueryBuilder();
    const repository = {
        createQueryBuilder: vi.fn(() => repositoryQuery),
        find: vi.fn(async () => []),
    };
    const connection = {
        getRepository: vi.fn(() => repository),
    };
    const listQueryBuilder = {
        build: vi.fn(() => listQuery),
    };
    const service = new PipelineLogService(
        connection as unknown as TransactionalConnection,
        listQueryBuilder as unknown as ListQueryBuilder,
    );
    const ctx = {
        channelId: 17,
        channel: { token: 'private-channel' },
    } as RequestContext;
    return { service, ctx, listQuery, repositoryQuery, repository };
}

function expectActiveChannelScope(query: ReturnType<typeof createQueryBuilder>): void {
    expect(query.leftJoin).toHaveBeenCalledWith('log.run', 'log_channel_run');
    expect(query.leftJoin).toHaveBeenCalledWith('log.pipeline', 'log_channel_pipeline');
    expect(query.leftJoin).toHaveBeenCalledWith(
        'log_channel_pipeline.channels',
        'log_active_channel',
        'log_active_channel.id = :activePipelineChannelId',
        { activePipelineChannelId: 17 },
    );
    const bracket = query.andWhere.mock.calls
        .map(call => call[0])
        .find(value => value instanceof Brackets) as Brackets | undefined;
    expect(bracket).toBeDefined();
    const where = {
        where: vi.fn().mockReturnThis(),
        orWhere: vi.fn().mockReturnThis(),
    };
    bracket?.whereFactory(where as never);
    expect(where.where).toHaveBeenCalledWith(
        'log_channel_run.channelId = :activeRunChannelId',
        { activeRunChannelId: '17' },
    );
    expect(where.orWhere).toHaveBeenCalledWith(
        '(log.runId IS NULL AND log_active_channel.id IS NOT NULL)',
    );
}

describe('PipelineLogService channel isolation', () => {
    it('scopes the standard list query to the active channel', async () => {
        const fixture = createFixture();

        await fixture.service.list(fixture.ctx);

        expectActiveChannelScope(fixture.listQuery);
    });

    it('requires run ownership for run-specific logs', async () => {
        const fixture = createFixture();

        await fixture.service.getRunLogs(fixture.ctx, 9);

        expect(fixture.repository.find).toHaveBeenCalledWith({
            where: { runId: 9, run: { channelId: '17' } },
            order: { createdAt: 'ASC' },
            take: expect.any(Number),
            relations: { pipeline: true, run: true },
        });
    });

    it('scopes search, statistics, and recent-log queries', async () => {
        const fixture = createFixture();

        await fixture.service.search(fixture.ctx, { level: LogLevel.ERROR });
        expectActiveChannelScope(fixture.repositoryQuery);

        fixture.repositoryQuery.leftJoin.mockClear();
        fixture.repositoryQuery.andWhere.mockClear();
        await fixture.service.getStats(fixture.ctx, 1);
        expect(fixture.repository.createQueryBuilder).toHaveBeenCalledTimes(6);
        expect(fixture.repositoryQuery.leftJoin).toHaveBeenCalledWith(
            'log.run',
            'log_channel_run',
        );

        fixture.repositoryQuery.leftJoin.mockClear();
        await fixture.service.getRecent(fixture.ctx, 5);
        expectActiveChannelScope(fixture.repositoryQuery);
    });
});
