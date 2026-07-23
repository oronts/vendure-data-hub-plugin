import {
    Args,
    Mutation,
    Parent,
    Query,
    ResolveField,
    Resolver,
} from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    Transaction,
} from '@vendure/core';
import {
    DeletionResponse,
    DeletionResult,
} from '@vendure/common/lib/generated-types';
import type { JsonObject } from '../../types';
import { DataHubSchema } from '../../entities/config';
import { DataHubSchemaPermission } from '../../permissions';
import { LOGGER_CONTEXTS } from '../../constants';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import {
    DataHubSchemaUsage,
    SchemaInUseError,
    SchemaRegistryService,
} from '../../services/schema';
import { toErrorOrUndefined } from '../../utils/error.utils';

@Resolver('DataHubSchema')
export class DataHubSchemaAdminResolver {
    private readonly logger: DataHubLogger;

    constructor(
        private readonly listQueryBuilder: ListQueryBuilder,
        private readonly schemas: SchemaRegistryService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SCHEMA_RESOLVER);
    }

    @Query()
    @Allow(DataHubSchemaPermission.Read)
    async dataHubSchemas(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<DataHubSchema> },
    ): Promise<PaginatedList<DataHubSchema>> {
        const query = this.listQueryBuilder.build(
            DataHubSchema,
            args.options ?? undefined,
            { ctx },
        );
        const [items, totalItems] = await query.getManyAndCount();
        return { items, totalItems };
    }

    @Query()
    @Allow(DataHubSchemaPermission.Read)
    async dataHubSchema(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
    ): Promise<DataHubSchema | null> {
        return this.schemas.getById(ctx, args.id);
    }

    @ResolveField()
    @Allow(DataHubSchemaPermission.Read)
    async usedBy(
        @Ctx() ctx: RequestContext,
        @Parent() schema: DataHubSchema,
    ): Promise<readonly DataHubSchemaUsage[]> {
        return this.schemas.findUsage(ctx, schema.schemaId, schema.version);
    }

    @Query()
    @Allow(DataHubSchemaPermission.Read)
    async dataHubSchemaVersions(
        @Ctx() ctx: RequestContext,
        @Args() args: { schemaId: string },
    ): Promise<DataHubSchema[]> {
        return this.schemas.findVersions(ctx, args.schemaId);
    }

    @Mutation()
    @Allow(DataHubSchemaPermission.Create)
    async createDataHubSchema(
        @Ctx() ctx: RequestContext,
        @Args() args: {
            input: {
                schemaId: string;
                version: string;
                compatibility?: string | null;
                definition: JsonObject;
                metadata?: JsonObject | null;
            };
        },
    ): Promise<DataHubSchema> {
        return this.schemas.create(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubSchemaPermission.Update)
    async updateDataHubSchema(
        @Ctx() ctx: RequestContext,
        @Args() args: {
            input: {
                id: ID;
                metadata?: JsonObject | null;
            };
        },
    ): Promise<DataHubSchema> {
        const { id, ...input } = args.input;
        const schema = await this.schemas.update(ctx, id, input);
        if (!schema) throw new Error(`Schema ${id} was not found`);
        return schema;
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubSchemaPermission.Delete)
    async deleteDataHubSchema(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
    ): Promise<DeletionResponse> {
        try {
            const deleted = await this.schemas.delete(ctx, args.id);
            return deleted
                ? { result: DeletionResult.DELETED }
                : {
                    result: DeletionResult.NOT_DELETED,
                    message: `Schema ${args.id} was not found`,
                };
        } catch (error: unknown) {
            if (error instanceof SchemaInUseError) {
                return {
                    result: DeletionResult.NOT_DELETED,
                    message: error.message,
                };
            }
            this.logger.error(
                'Failed to delete schema version',
                toErrorOrUndefined(error),
            );
            return {
                result: DeletionResult.NOT_DELETED,
                message: 'Schema version could not be deleted',
            };
        }
    }
}
