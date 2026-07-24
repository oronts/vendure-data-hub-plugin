import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import {
    Channel,
    ChannelAware,
    ChannelService,
    ForbiddenError,
    ID,
    idsAreEqual,
    InternalServerError,
    Permission,
    RequestContext,
    RoleService,
    TransactionalConnection,
    Type,
    UserInputError,
    VendureEntity,
} from '@vendure/core';
import {
    DataHubConnection,
    DataHubSchema,
    DataHubSecret,
    Pipeline,
} from '../../entities';
import { DEFAULT_CHANNEL_CODE } from '../../../shared/constants';

type ManagedResource = VendureEntity & ChannelAware;

export interface AssignManagedResourcesToChannelInput {
    readonly ids: readonly ID[];
    readonly channelId: ID;
}

export interface ManagedResourceDeletePlan<T extends ManagedResource> {
    readonly entity: T;
    readonly physicallyDelete: boolean;
}

const MANAGED_RESOURCE_TYPES: ReadonlyArray<Type<ManagedResource>> = [
    Pipeline,
    DataHubConnection,
    DataHubSecret,
    DataHubSchema,
] as const;

const CHANNEL_BACKFILL_BATCH_SIZE = 100;
export const MANAGED_RESOURCE_CHANNEL_BACKFILL_LIMIT = 10_000;
export const MANAGED_RESOURCE_CHANNEL_MUTATION_LIMIT = 100;

@Injectable()
export class ManagedResourceChannelService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly channelService: ChannelService,
        private readonly roleService: RoleService,
    ) {}

    assignToCurrentChannel<T extends ManagedResource>(
        ctx: RequestContext,
        entity: T,
    ): Promise<T> {
        return this.channelService.assignToCurrentChannel(entity, ctx);
    }

    async getAssignedChannels<T extends ManagedResource>(
        ctx: RequestContext,
        entityType: Type<T>,
        id: ID,
    ): Promise<Channel[]> {
        const entity = await this.connection.findOneInChannel(
            ctx,
            entityType,
            id,
            ctx.channelId,
        );
        if (!entity) return [];
        const channels = await this.loadAssignedChannels(ctx, entityType, id);
        return ctx.channel.code === DEFAULT_CHANNEL_CODE
            ? channels
            : channels.filter(channel => idsAreEqual(channel.id, ctx.channelId));
    }

    async assignToChannel<T extends ManagedResource>(
        ctx: RequestContext,
        entityType: Type<T>,
        input: AssignManagedResourcesToChannelInput,
        permissions: readonly Permission[],
    ): Promise<T[]> {
        this.assertValidMutationIds(input.ids);
        await this.assertChannelPermission(ctx, input.channelId, permissions);
        const resources = await this.assertResourcesInActiveChannel(
            ctx,
            entityType,
            input.ids,
        );

        for (const id of input.ids) {
            await this.channelService.assignToChannels(ctx, entityType, id, [input.channelId]);
        }

        for (const resource of resources) {
            resource.channels = await this.loadAssignedChannels(
                ctx,
                entityType,
                resource.id,
            );
        }
        return resources;
    }

    async removeFromChannel<T extends ManagedResource>(
        ctx: RequestContext,
        entityType: Type<T>,
        input: AssignManagedResourcesToChannelInput,
        permissions: readonly Permission[],
    ): Promise<T[]> {
        this.assertValidMutationIds(input.ids);
        await this.assertChannelPermission(ctx, input.channelId, permissions);
        const defaultChannel = await this.channelService.getDefaultChannel(ctx);
        if (idsAreEqual(input.channelId, defaultChannel.id)) {
            throw new UserInputError('error.items-cannot-be-removed-from-default-channel');
        }
        const resources = await this.assertResourcesInActiveChannel(
            ctx,
            entityType,
            input.ids,
        );

        for (const id of input.ids) {
            await this.channelService.removeFromChannels(ctx, entityType, id, [input.channelId]);
        }

        return resources;
    }

    async prepareDelete<T extends ManagedResource>(
        ctx: RequestContext,
        entityType: Type<T>,
        id: ID,
    ): Promise<ManagedResourceDeletePlan<T>> {
        const entity = await this.connection.getEntityOrThrow(ctx, entityType, id, {
            channelId: ctx.channelId,
        });
        entity.channels = await this.loadAssignedChannels(ctx, entityType, id);
        if (ctx.channel.code !== DEFAULT_CHANNEL_CODE) {
            return { entity, physicallyDelete: false };
        }

        const otherChannels = entity.channels.filter(
            channel => channel.code !== DEFAULT_CHANNEL_CODE,
        );
        if (otherChannels.length > 0) {
            throw new UserInputError(
                `Resource is assigned to channels: ${otherChannels
                    .map(channel => channel.code)
                    .sort()
                    .join(', ')}`,
            );
        }
        return { entity, physicallyDelete: true };
    }

    async removeFromActiveChannel<T extends ManagedResource>(
        ctx: RequestContext,
        entityType: Type<T>,
        id: ID,
    ): Promise<void> {
        await this.channelService.removeFromChannels(
            ctx,
            entityType,
            id,
            [ctx.channelId],
        );
    }

    async initializeDefaultChannel(
        ctx: RequestContext,
        maxResources = MANAGED_RESOURCE_CHANNEL_BACKFILL_LIMIT,
    ): Promise<number> {
        const unassignedCount = await this.countUnassigned(ctx);
        if (unassignedCount > maxResources) {
            throw new Error(
                `Managed resource channel backfill requires ${unassignedCount} assignments, exceeding the safety limit of ${maxResources}`,
            );
        }
        const defaultChannel = await this.channelService.getDefaultChannel(ctx);
        let assigned = 0;
        const attempted = new Set<string>();

        for (const entityType of MANAGED_RESOURCE_TYPES) {
            let resources = await this.findUnassigned(ctx, entityType);
            while (resources.length > 0) {
                for (const resource of resources) {
                    const attemptKey = `${entityType.name}:${String(resource.id)}`;
                    if (attempted.has(attemptKey) || assigned >= unassignedCount) {
                        throw new Error(
                            `Managed resource channel backfill made no progress for ${attemptKey}`,
                        );
                    }
                    attempted.add(attemptKey);
                    await this.channelService.assignToChannels(
                        ctx,
                        entityType,
                        resource.id,
                        [defaultChannel.id],
                    );
                    assigned += 1;
                }
                resources = await this.findUnassigned(ctx, entityType);
            }
        }

        return assigned;
    }

    async countUnassigned(ctx: RequestContext): Promise<number> {
        let total = 0;
        for (const entityType of MANAGED_RESOURCE_TYPES) {
            total += await this.connection
                .getRepository(ctx, entityType)
                .createQueryBuilder('resource')
                .leftJoin('resource.channels', 'channel')
                .where('channel.id IS NULL')
                .getCount();
        }
        return total;
    }

    private async assertChannelPermission(
        ctx: RequestContext,
        channelId: ID,
        permissions: readonly Permission[],
    ): Promise<void> {
        const allowed = await this.roleService.userHasAnyPermissionsOnChannel(
            ctx,
            channelId,
            [...permissions],
        );
        if (!allowed) {
            throw new ForbiddenError();
        }
    }

    private assertValidMutationIds(ids: readonly ID[]): void {
        if (ids.length === 0 || ids.length > MANAGED_RESOURCE_CHANNEL_MUTATION_LIMIT) {
            throw new UserInputError(
                `Channel mutations require between 1 and ${MANAGED_RESOURCE_CHANNEL_MUTATION_LIMIT} resource IDs`,
            );
        }
        const duplicate = ids.find((id, index) => (
            ids.slice(0, index).some(previous => idsAreEqual(previous, id))
        ));
        if (duplicate !== undefined) {
            throw new UserInputError('Channel mutation resource IDs must be unique');
        }
    }

    private async assertResourcesInActiveChannel<T extends ManagedResource>(
        ctx: RequestContext,
        entityType: Type<T>,
        ids: readonly ID[],
    ): Promise<T[]> {
        const resources: T[] = [];
        for (const id of ids) {
            const resource = await this.connection.getEntityOrThrow(ctx, entityType, id, {
                channelId: ctx.channelId,
            });
            resource.channels = await this.loadAssignedChannels(ctx, entityType, id);
            resources.push(resource);
        }
        return resources;
    }

    private async loadAssignedChannels<T extends ManagedResource>(
        ctx: RequestContext,
        entityType: Type<T>,
        entityId: ID,
    ): Promise<Channel[]> {
        const repository = this.connection.getRepository(ctx, entityType);
        const relation = repository.metadata.findRelationWithPropertyPath('channels');
        const junction = relation?.junctionEntityMetadata;
        const tableName = junction?.tableName;
        const entityColumn = junction?.columns[0]?.databaseName;
        const channelColumn = junction?.inverseColumns[0]?.databaseName;
        if (!tableName || !entityColumn || !channelColumn) {
            throw new InternalServerError(
                `Could not resolve channel join metadata for ${repository.metadata.name}`,
            );
        }
        const rows = await repository.manager
            .createQueryBuilder()
            .select(`junction.${channelColumn}`, 'channelId')
            .from(tableName, 'junction')
            .where(`junction.${entityColumn} = :entityId`, { entityId })
            .getRawMany<{ channelId: ID }>();
        const channelIds = rows.map(row => row.channelId);
        if (channelIds.length === 0) return [];
        return this.connection.getRepository(ctx, Channel).find({
            where: { id: In(channelIds) },
            order: { id: 'ASC' },
        });
    }

    private findUnassigned<T extends ManagedResource>(
        ctx: RequestContext,
        entityType: Type<T>,
    ): Promise<T[]> {
        return this.connection
            .getRepository(ctx, entityType)
            .createQueryBuilder('resource')
            .leftJoin('resource.channels', 'channel')
            .where('channel.id IS NULL')
            .take(CHANNEL_BACKFILL_BATCH_SIZE)
            .getMany();
    }
}
