import { describe, expect, it, vi } from 'vitest';
import { DataHubConnection } from '../../entities';
import { ManagedResourceChannelService } from './managed-resource-channel.service';

const defaultContext = {
    channelId: 1,
    channel: { id: 1, code: '__default_channel__' },
} as never;
const retailContext = {
    channelId: 2,
    channel: { id: 2, code: 'retail' },
} as never;
const permission = 'ManageDataHubConnections' as never;

function createFixture(overrides: {
    allowed?: boolean;
    entity?: DataHubConnection;
} = {}) {
    const entity = overrides.entity ?? Object.assign(new DataHubConnection(), {
        id: 11,
        channels: [
            { id: 1, code: '__default_channel__' },
            { id: 2, code: 'retail' },
        ],
    });
    const queryBuilder = {
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
        getCount: vi.fn().mockResolvedValue(0),
    };
    const junctionQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue(
            entity.channels.map(channel => ({ channelId: channel.id })),
        ),
    };
    const repository = {
        metadata: {
            name: 'DataHubConnection',
            findRelationWithPropertyPath: vi.fn(() => ({
                junctionEntityMetadata: {
                    tableName: 'data_hub_connection_channels_channel',
                    columns: [{ databaseName: 'dataHubConnectionId' }],
                    inverseColumns: [{ databaseName: 'channelId' }],
                },
            })),
        },
        manager: { createQueryBuilder: vi.fn(() => junctionQueryBuilder) },
        createQueryBuilder: vi.fn(() => queryBuilder),
    };
    const channelRepository = {
        find: vi.fn().mockResolvedValue(entity.channels),
    };
    const connection = {
        getEntityOrThrow: vi.fn().mockResolvedValue(entity),
        findOneInChannel: vi.fn().mockResolvedValue(entity),
        findByIdsInChannel: vi.fn().mockResolvedValue([entity]),
        getRepository: vi.fn((_ctx, entityType) => (
            entityType.name === 'Channel' ? channelRepository : repository
        )),
    };
    const channelService = {
        assignToCurrentChannel: vi.fn(async value => value),
        assignToChannels: vi.fn(async () => entity),
        removeFromChannels: vi.fn(async () => entity),
        getDefaultChannel: vi.fn().mockResolvedValue({ id: 1, code: '__default_channel__' }),
    };
    const roleService = {
        userHasAnyPermissionsOnChannel: vi.fn().mockResolvedValue(
            overrides.allowed ?? true,
        ),
    };
    const service = new ManagedResourceChannelService(
        connection as never,
        channelService as never,
        roleService as never,
    );
    return {
        service,
        entity,
        connection,
        channelService,
        roleService,
        queryBuilder,
        junctionQueryBuilder,
        channelRepository,
    };
}

describe('ManagedResourceChannelService', () => {
    it('rejects empty, oversized, and duplicate mutation batches before access checks', async () => {
        const fixture = createFixture();

        for (const ids of [[], Array.from({ length: 101 }, (_, index) => index + 1), [11, '11']]) {
            await expect(fixture.service.assignToChannel(
                defaultContext,
                DataHubConnection,
                { ids, channelId: 2 },
                [permission],
            )).rejects.toThrow();
        }
        expect(fixture.roleService.userHasAnyPermissionsOnChannel).not.toHaveBeenCalled();
        expect(fixture.connection.getEntityOrThrow).not.toHaveBeenCalled();
    });

    it('rejects assignment without permission on the target channel', async () => {
        const fixture = createFixture({ allowed: false });

        await expect(fixture.service.assignToChannel(
            defaultContext,
            DataHubConnection,
            { ids: [11], channelId: 2 },
            [permission],
        )).rejects.toThrow();
        expect(fixture.connection.getEntityOrThrow).not.toHaveBeenCalled();
        expect(fixture.channelService.assignToChannels).not.toHaveBeenCalled();
    });

    it('rejects assignment when a source resource is not in the active channel', async () => {
        const fixture = createFixture();
        fixture.connection.getEntityOrThrow.mockRejectedValueOnce(
            new Error('resource not found'),
        );

        await expect(fixture.service.assignToChannel(
            defaultContext,
            DataHubConnection,
            { ids: [11], channelId: 2 },
            [permission],
        )).rejects.toThrow('resource not found');
        expect(fixture.channelService.assignToChannels).not.toHaveBeenCalled();
    });

    it('rejects removal from the default channel', async () => {
        const fixture = createFixture();

        await expect(fixture.service.removeFromChannel(
            defaultContext,
            DataHubConnection,
            { ids: [11], channelId: 1 },
            [permission],
        )).rejects.toThrow();
        expect(fixture.channelService.removeFromChannels).not.toHaveBeenCalled();
    });

    it('keeps repeated assignment idempotent through Vendure ChannelService', async () => {
        const fixture = createFixture();
        const input = { ids: [11], channelId: 2 };

        await fixture.service.assignToChannel(
            defaultContext,
            DataHubConnection,
            input,
            [permission],
        );
        await fixture.service.assignToChannel(
            defaultContext,
            DataHubConnection,
            input,
            [permission],
        );

        expect(fixture.channelService.assignToChannels).toHaveBeenCalledTimes(2);
        expect(fixture.junctionQueryBuilder.getRawMany).toHaveBeenCalled();
    });

    it('returns the validated pre-removal resource even when removing the active target', async () => {
        const fixture = createFixture();

        await expect(fixture.service.removeFromChannel(
            retailContext,
            DataHubConnection,
            { ids: [11], channelId: 2 },
            [permission],
        )).resolves.toEqual([fixture.entity]);
        expect(fixture.connection.findByIdsInChannel).not.toHaveBeenCalled();
    });

    it('only exposes the active channel outside the default channel', async () => {
        const fixture = createFixture();

        await expect(fixture.service.getAssignedChannels(
            defaultContext,
            DataHubConnection,
            11,
        )).resolves.toHaveLength(2);
        await expect(fixture.service.getAssignedChannels(
            retailContext,
            DataHubConnection,
            11,
        )).resolves.toEqual([{ id: 2, code: 'retail' }]);
    });

    it('fails closed before backfill when the discovery ceiling is exceeded', async () => {
        const fixture = createFixture();
        fixture.queryBuilder.getCount.mockResolvedValue(1);

        await expect(
            fixture.service.initializeDefaultChannel(defaultContext, 3),
        ).rejects.toThrow('exceeding the safety limit of 3');
        expect(fixture.channelService.assignToChannels).not.toHaveBeenCalled();
    });

    it('fails closed when a backfill batch repeats without progress', async () => {
        const fixture = createFixture();
        fixture.queryBuilder.getCount.mockResolvedValue(1);
        fixture.queryBuilder.getMany.mockResolvedValue([fixture.entity]);

        await expect(
            fixture.service.initializeDefaultChannel(defaultContext, 10),
        ).rejects.toThrow('made no progress');
        expect(fixture.channelService.assignToChannels).toHaveBeenCalledTimes(1);
    });

    it('blocks default-channel deletion when ordinary relation loading misses another assignment', async () => {
        const fixture = createFixture();
        fixture.entity.channels = [{ id: 1, code: '__default_channel__' } as never];
        fixture.junctionQueryBuilder.getRawMany.mockResolvedValue([
            { channelId: 1 },
            { channelId: 2 },
        ]);
        fixture.channelRepository.find.mockResolvedValue([
            { id: 1, code: '__default_channel__' },
            { id: 2, code: 'retail' },
        ]);

        await expect(fixture.service.prepareDelete(
            defaultContext,
            DataHubConnection,
            11,
        )).rejects.toThrow('retail');
    });
});
