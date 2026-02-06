import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, ListQueryBuilder, ListQueryOptions, PaginatedList, RequestContext, Transaction, TransactionalConnection } from '@vendure/core';
import { DeletionResponse, DeletionResult } from '@vendure/common/lib/generated-types';
import type { JsonObject } from '../../types/index';
import { DataHubSecret } from '../../entities/config';
import { DataHubSecretPermission } from '../../permissions';
import { SecretProvider } from '../../constants/enums';
import { RESOLVER_ERROR_MESSAGES } from '../../constants/index';

const MASKED_SECRET_VALUE = '********';

/** Represents a DataHubSecret with the value masked for API responses */
interface MaskedDataHubSecret {
    id: ID;
    createdAt: Date;
    updatedAt: Date;
    code: string;
    provider: SecretProvider;
    value: string | null;
    metadata: JsonObject | null;
}

@Resolver()
export class DataHubSecretAdminResolver {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    @Query()
    @Allow(DataHubSecretPermission.Read)
    async dataHubSecrets(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<DataHubSecret> },
    ): Promise<PaginatedList<MaskedDataHubSecret>> {
        const qb = this.listQueryBuilder.build(DataHubSecret, args.options, { ctx });
        const [items, totalItems] = await qb.getManyAndCount();
        const mapped = items.map(s => this.maskSecretValue(s));
        return { items: mapped, totalItems };
    }

    @Query()
    @Allow(DataHubSecretPermission.Read)
    async dataHubSecret(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<MaskedDataHubSecret | null> {
        const secret = await this.connection.getRepository(ctx, DataHubSecret).findOne({ where: { id: args.id } });
        if (!secret) return null;
        return this.maskSecretValue(secret);
    }

    private maskSecretValue(s: DataHubSecret): MaskedDataHubSecret {
        return {
            id: s.id,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            code: s.code,
            provider: s.provider,
            value: s.value ? MASKED_SECRET_VALUE : null,
            metadata: s.metadata,
        };
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubSecretPermission.Create)
    async createDataHubSecret(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { code: string; provider?: string; value?: string; metadata?: JsonObject } },
    ): Promise<MaskedDataHubSecret> {
        const repo = this.connection.getRepository(ctx, DataHubSecret);
        const entity = new DataHubSecret();
        entity.code = args.input.code;
        entity.provider = (args.input.provider as SecretProvider) ?? SecretProvider.INLINE;
        entity.value = args.input.value ?? null;
        entity.metadata = args.input.metadata ?? null;
        const saved = await repo.save(entity);
        const result = await this.dataHubSecret(ctx, { id: saved.id });
        if (!result) {
            throw new Error(RESOLVER_ERROR_MESSAGES.SECRET_CREATE_FAILED);
        }
        return result;
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubSecretPermission.Update)
    async updateDataHubSecret(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { id: ID; code?: string; provider?: string; value?: string; metadata?: JsonObject } },
    ): Promise<MaskedDataHubSecret> {
        const repo = this.connection.getRepository(ctx, DataHubSecret);
        const entity = await this.connection.getEntityOrThrow(ctx, DataHubSecret, args.input.id);
        if (typeof args.input.code === 'string') entity.code = args.input.code;
        if (typeof args.input.provider === 'string') entity.provider = args.input.provider as SecretProvider;
        if (typeof args.input.value === 'string' || args.input.value === null) entity.value = args.input.value ?? null;
        if (args.input.metadata !== undefined) entity.metadata = args.input.metadata ?? null;
        await repo.save(entity, { reload: false });
        const result = await this.dataHubSecret(ctx, { id: entity.id });
        if (!result) {
            throw new Error(RESOLVER_ERROR_MESSAGES.SECRET_UPDATE_FAILED);
        }
        return result;
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
