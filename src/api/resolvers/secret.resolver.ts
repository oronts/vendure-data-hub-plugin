import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, ListQueryBuilder, ListQueryOptions, PaginatedList, RequestContext, Transaction } from '@vendure/core';
import { DeletionResponse, DeletionResult } from '@vendure/common/lib/generated-types';
import { DataHubSecret } from '../../entities/config';
import { DataHubSecretPermission } from '../../permissions';
import { TransactionalConnection } from '@vendure/core';

@Resolver()
export class DataHubSecretAdminResolver {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    // SECRET QUERIES

    @Query()
    @Allow(DataHubSecretPermission.Read)
    async dataHubSecrets(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<DataHubSecret> },
    ): Promise<PaginatedList<DataHubSecret>> {
        const qb = this.listQueryBuilder.build(DataHubSecret, args.options, { ctx });
        const [items, totalItems] = await qb.getManyAndCount();
        // Map to plain objects with all fields, masking only the value
        const mapped = items.map(s => ({
            id: s.id,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            code: s.code,
            provider: s.provider,
            value: s.value ? '********' : null, // Mask value but indicate if one exists
            metadata: s.metadata,
        }));
        return { items: mapped as any, totalItems };
    }

    @Query()
    @Allow(DataHubSecretPermission.Read)
    async dataHubSecret(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<DataHubSecret | null> {
        const s = await this.connection.getRepository(ctx, DataHubSecret).findOne({ where: { id: args.id } } as any);
        if (!s) return null;
        // Return plain object with all fields, masking the actual value
        return {
            id: s.id,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            code: s.code,
            provider: s.provider,
            value: s.value ? '********' : null, // Mask value but indicate if one exists
            metadata: s.metadata,
        } as any;
    }

    // SECRET MUTATIONS

    @Mutation()
    @Transaction()
    @Allow(DataHubSecretPermission.Create)
    async createDataHubSecret(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { code: string; provider?: string; value?: string; metadata?: any } },
    ): Promise<DataHubSecret> {
        const repo = this.connection.getRepository(ctx, DataHubSecret);
        const entity = new DataHubSecret();
        entity.code = args.input.code;
        entity.provider = args.input.provider ?? 'inline';
        entity.value = args.input.value ?? null;
        entity.metadata = (args.input.metadata as any) ?? null;
        const saved = await repo.save(entity);
        return this.dataHubSecret(ctx, { id: saved.id } as any) as any;
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubSecretPermission.Update)
    async updateDataHubSecret(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { id: ID; code?: string; provider?: string; value?: string; metadata?: any } },
    ): Promise<DataHubSecret> {
        const repo = this.connection.getRepository(ctx, DataHubSecret);
        const entity = await this.connection.getEntityOrThrow(ctx, DataHubSecret, args.input.id);
        if (typeof args.input.code === 'string') entity.code = args.input.code;
        if (typeof args.input.provider === 'string') entity.provider = args.input.provider;
        if (typeof args.input.value === 'string' || args.input.value === null) entity.value = args.input.value ?? null;
        if (args.input.metadata !== undefined) entity.metadata = args.input.metadata ?? null;
        await repo.save(entity, { reload: false });
        return this.dataHubSecret(ctx, { id: entity.id } as any) as any;
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubSecretPermission.Delete)
    async deleteDataHubSecret(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<DeletionResponse> {
        const repo = this.connection.getRepository(ctx, DataHubSecret);
        const entity = await this.connection.getEntityOrThrow(ctx, DataHubSecret, args.id);
        try {
            await repo.remove(entity);
            return { result: DeletionResult.DELETED };
        } catch (e) {
            return { result: DeletionResult.NOT_DELETED, message: e instanceof Error ? e.message : String(e) };
        }
    }
}
