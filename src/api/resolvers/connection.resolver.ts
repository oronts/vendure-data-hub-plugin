import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, ListQueryBuilder, ListQueryOptions, PaginatedList, RequestContext, Transaction } from '@vendure/core';
import { DeletionResponse, DeletionResult } from '@vendure/common/lib/generated-types';
import { TransactionalConnection } from '@vendure/core';
import { DataHubConnection } from '../../entities/config';
import { ManageDataHubConnectionsPermission } from '../../permissions';

@Resolver()
export class DataHubConnectionAdminResolver {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    // CONNECTION QUERIES

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
        return this.connection.getRepository(ctx, DataHubConnection).findOne({ where: { id: args.id } } as any);
    }

    // CONNECTION MUTATIONS

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async createDataHubConnection(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { code: string; type?: string; config?: any } },
    ): Promise<DataHubConnection> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        const entity = new DataHubConnection();
        entity.code = args.input.code;
        entity.type = args.input.type ?? 'http';
        entity.config = args.input.config ?? {};
        const saved = await repo.save(entity);
        const result = await repo.findOne({ where: { id: saved.id } });
        if (!result) {
            throw new Error('Failed to create connection');
        }
        return result;
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubConnectionsPermission.Permission)
    async updateDataHubConnection(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { id: ID; code?: string; type?: string; config?: any } },
    ): Promise<DataHubConnection> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        const entity = await this.connection.getEntityOrThrow(ctx, DataHubConnection, args.input.id);
        if (typeof args.input.code === 'string') entity.code = args.input.code;
        if (typeof args.input.type === 'string') entity.type = args.input.type;
        if (args.input.config !== undefined) entity.config = args.input.config ?? {};
        await repo.save(entity);
        const result = await repo.findOne({ where: { id: entity.id } });
        if (!result) {
            throw new Error('Failed to update connection');
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
            return { result: DeletionResult.NOT_DELETED, message: e instanceof Error ? e.message : String(e) };
        }
    }
}
