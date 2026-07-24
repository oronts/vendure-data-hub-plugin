import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Channel, Ctx, ID, ListQueryBuilder, ListQueryOptions, PaginatedList, RequestContext, Transaction } from '@vendure/core';
import { DeletionResponse, DeletionResult } from '@vendure/common/lib/generated-types';
import type { JsonObject } from '../../types/index';
import { DataHubConnection } from '../../entities/config';
import { ManageDataHubConnectionsPermission } from '../../permissions';
import { RESOLVER_ERROR_MESSAGES, LOGGER_CONTEXTS } from '../../constants/index';
import { getErrorMessage } from '../../utils/error.utils';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { ConnectionService } from '../../services/config/connection.service';
import { ResourceInUseError } from '../../services/config/resource-reference.service';
import { CodeFirstConfigurationError } from '../../services/config/configuration-ownership';
import { ManagedResourceChannelService } from '../../services/config/managed-resource-channel.service';

@Resolver('DataHubConnection')
export class DataHubConnectionAdminResolver {
    private readonly logger: DataHubLogger;

    constructor(
        private listQueryBuilder: ListQueryBuilder,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        private managedResourceChannels: ManagedResourceChannelService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CONNECTION_RESOLVER);
    }

    @Query()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async dataHubConnections(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<DataHubConnection> },
    ): Promise<PaginatedList<DataHubConnection>> {
        const qb = this.listQueryBuilder.build(DataHubConnection, args.options ?? undefined, {
            ctx,
            channelId: ctx.channelId,
        });
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    @Query()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async dataHubConnection(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<DataHubConnection | null> {
        return this.connectionService.getById(ctx, args.id);
    }

    @ResolveField()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    channels(
        @Ctx() ctx: RequestContext,
        @Parent() connection: DataHubConnection,
    ): Promise<Channel[]> {
        return this.channelManager.getAssignedChannels(
            ctx,
            DataHubConnection,
            connection.id,
        );
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async createDataHubConnection(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { code: string; type?: string; config?: JsonObject } },
    ): Promise<DataHubConnection> {
        return this.connectionService.create(ctx, {
            code: args.input.code,
            type: args.input.type ?? 'HTTP',
            config: args.input.config ?? {},
        });
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async updateDataHubConnection(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { id: ID; code?: string; type?: string; config?: JsonObject } },
    ): Promise<DataHubConnection> {
        const { id, ...input } = args.input;
        const result = await this.connectionService.update(ctx, id, input);
        if (!result) {
            throw new Error(RESOLVER_ERROR_MESSAGES.CONNECTION_UPDATE_FAILED);
        }
        return result;
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async deleteDataHubConnection(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<DeletionResponse> {
        try {
            const deleted = await this.connectionService.delete(ctx, args.id);
            return deleted
                ? { result: DeletionResult.DELETED }
                : {
                    result: DeletionResult.NOT_DELETED,
                    message: RESOLVER_ERROR_MESSAGES.CONNECTION_NOT_FOUND,
                };
        } catch (e) {
            if (
                e instanceof ResourceInUseError
                || e instanceof CodeFirstConfigurationError
            ) {
                return {
                    result: DeletionResult.NOT_DELETED,
                    message: e.message,
                };
            }
            this.logger.error(
                `Failed to delete connection: ${getErrorMessage(e)}`,
            );
            return {
                result: DeletionResult.NOT_DELETED,
                message: RESOLVER_ERROR_MESSAGES.CONNECTION_DELETE_FAILED,
            };
        }
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    assignDataHubConnectionsToChannel(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { connectionIds: ID[]; channelId: ID } },
    ): Promise<DataHubConnection[]> {
        return this.channelManager.assignToChannel(
            ctx,
            DataHubConnection,
            { ids: args.input.connectionIds, channelId: args.input.channelId },
            [ManageDataHubConnectionsPermission.Permission],
        );
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    removeDataHubConnectionsFromChannel(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { connectionIds: ID[]; channelId: ID } },
    ): Promise<DataHubConnection[]> {
        return this.channelManager.removeFromChannel(
            ctx,
            DataHubConnection,
            { ids: args.input.connectionIds, channelId: args.input.channelId },
            [ManageDataHubConnectionsPermission.Permission],
        );
    }

    private get channelManager(): ManagedResourceChannelService {
        return this.managedResourceChannels;
    }
}
