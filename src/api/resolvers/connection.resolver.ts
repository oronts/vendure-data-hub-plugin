import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, ListQueryBuilder, ListQueryOptions, Logger, PaginatedList, RequestContext, Transaction, TransactionalConnection } from '@vendure/core';
import { DeletionResponse, DeletionResult } from '@vendure/common/lib/generated-types';
import type { FindOptionsWhere } from 'typeorm';
import type { JsonObject } from '../../types/index';
import { DataHubConnection } from '../../entities/config';
import { ManageDataHubConnectionsPermission } from '../../permissions';
import { ConnectionType } from '../../constants/enums';
import { RESOLVER_ERROR_MESSAGES } from '../../constants/index';

@Resolver()
export class DataHubConnectionAdminResolver {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    @Query()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async dataHubConnections(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<DataHubConnection> },
    ): Promise<PaginatedList<DataHubConnection>> {
        const qb = this.listQueryBuilder.build(DataHubConnection, args.options, { ctx });
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    @Query()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async dataHubConnection(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<DataHubConnection | null> {
        return this.connection.getRepository(ctx, DataHubConnection).findOne({ where: { id: args.id } as FindOptionsWhere<DataHubConnection> });
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async createDataHubConnection(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { code: string; type?: string; config?: JsonObject } },
    ): Promise<DataHubConnection> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        const entity = new DataHubConnection();
        entity.code = args.input.code;
        entity.type = (args.input.type as ConnectionType) ?? ConnectionType.HTTP;
        entity.config = args.input.config ?? {};
        const saved = await repo.save(entity);
        const result = await repo.findOne({ where: { id: saved.id } });
        if (!result) {
            throw new Error(RESOLVER_ERROR_MESSAGES.CONNECTION_CREATE_FAILED);
        }
        return result;
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async updateDataHubConnection(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { id: ID; code?: string; type?: string; config?: JsonObject } },
    ): Promise<DataHubConnection> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        const entity = await this.connection.getEntityOrThrow(ctx, DataHubConnection, args.input.id);
        if (typeof args.input.code === 'string') entity.code = args.input.code;
        if (typeof args.input.type === 'string') entity.type = args.input.type as ConnectionType;
        if (args.input.config !== undefined) entity.config = args.input.config ?? {};
        await repo.save(entity);
        const result = await repo.findOne({ where: { id: entity.id } });
        if (!result) {
            throw new Error(RESOLVER_ERROR_MESSAGES.CONNECTION_UPDATE_FAILED);
        }
        return result;
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async deleteDataHubConnection(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<DeletionResponse> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        const entity = await this.connection.getEntityOrThrow(ctx, DataHubConnection, args.id);
        try {
            await repo.remove(entity);
            return { result: DeletionResult.DELETED };
        } catch (e) {
            Logger.error(
                `Failed to delete connection: ${e instanceof Error ? e.message : String(e)}`,
                'DataHub',
            );
            return { result: DeletionResult.NOT_DELETED, message: 'Failed to delete connection due to an internal error' };
        }
    }
}
