import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Channel,
    Ctx,
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    Transaction,
    TransactionalConnection,
} from '@vendure/core';
import {
    DeletionResponse,
    DeletionResult,
} from '@vendure/common/lib/generated-types';
import { CODE_PATTERN, ENV_VARIABLE_NAME_PATTERN } from '../../../shared';
import type { JsonObject } from '../../types/index';
import { DataHubSecret } from '../../entities/config';
import { DataHubSecretPermission } from '../../permissions';
import { SecretProvider } from '../../constants/enums';
import {
    RESOLVER_ERROR_MESSAGES,
    LOGGER_CONTEXTS,
    SECRET_REFERENCE_PAGING,
} from '../../constants/index';
import { getErrorMessage } from '../../utils/error.utils';
import { isEncrypted } from '../../utils/encryption.utils';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { SecretService } from '../../services/config/secret.service';
import {
    ResourceInUseError,
    ResourceReferenceService,
} from '../../services/config/resource-reference.service';
import { ManagedResourceChannelService } from '../../services/config/managed-resource-channel.service';

const SUPPORTED_SECRET_PROVIDERS = [
    SecretProvider.INLINE,
    SecretProvider.ENV,
] as const;
type SupportedSecretProvider = (typeof SUPPORTED_SECRET_PROVIDERS)[number];

interface MaskedDataHubSecret {
    id: ID;
    createdAt: Date;
    updatedAt: Date;
    code: string;
    provider: SecretProvider;
    hasValue: boolean;
    valueStatus: 'MISSING' | 'ENV_REFERENCE' | 'ENCRYPTED' | 'UNENCRYPTED';
    isOverridden: boolean;
    metadata: JsonObject | null;
}

interface CreateSecretInput {
    code: string;
    provider?: string | null;
    value?: string | null;
    metadata?: JsonObject | null;
}

interface UpdateSecretInput {
    id: ID;
    code?: string | null;
    provider?: string | null;
    value?: string | null;
    clearValue?: boolean | null;
    metadata?: JsonObject | null;
}

interface SecretReferenceArgs {
    search?: string | null;
    skip?: number | null;
    take?: number | null;
}

interface SecretReference {
    code: string;
    provider: string;
    source: 'config' | 'database';
}

function normalizeSecretProvider(
    provider: string | null | undefined,
    fallback: SecretProvider,
): SupportedSecretProvider {
    const normalized = provider?.toUpperCase() ?? fallback;
    if (
        !SUPPORTED_SECRET_PROVIDERS.includes(
            normalized as SupportedSecretProvider,
        )
    ) {
        throw new Error(
            `Invalid secret provider: "${provider}". Supported providers: ${SUPPORTED_SECRET_PROVIDERS.join(', ')}`,
        );
    }
    return normalized as SupportedSecretProvider;
}

function hasReplacementValue(
    value: string | null | undefined,
): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function assertValidSecretCode(code: string): void {
    if (code.trim() !== code || !CODE_PATTERN.test(code)) {
        throw new Error(
            'Secret codes must start with a letter and contain only letters, numbers, hyphens, and underscores',
        );
    }
}

function assertValidProviderValue(
    provider: SecretProvider,
    value: string,
): void {
    if (
        provider === SecretProvider.ENV &&
        !ENV_VARIABLE_NAME_PATTERN.test(value)
    ) {
        throw new Error(
            'Environment variable names must start with an uppercase letter and contain only uppercase letters, numbers, and underscores',
        );
    }
}

@Resolver('DataHubSecret')
export class DataHubSecretAdminResolver {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private secretService: SecretService,
        private resourceReferences: ResourceReferenceService,
        loggerFactory: DataHubLoggerFactory,
        private managedResourceChannels: ManagedResourceChannelService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SECRET_RESOLVER);
    }

    @Query()
    @Allow(DataHubSecretPermission.Read)
    async dataHubSecrets(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<DataHubSecret> },
    ): Promise<PaginatedList<MaskedDataHubSecret>> {
        const qb = this.listQueryBuilder.build(
            DataHubSecret,
            args.options ?? undefined,
            { ctx, channelId: ctx.channelId },
        );
        const [items, totalItems] = await qb.getManyAndCount();
        return {
            items: items.map(secret => this.maskSecretValue(secret)),
            totalItems,
        };
    }

    @Query()
    @Allow(DataHubSecretPermission.Read)
    async dataHubSecret(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
    ): Promise<MaskedDataHubSecret | null> {
        const secret = await this.secretService.getById(ctx, String(args.id));
        return secret ? this.maskSecretValue(secret) : null;
    }

    @ResolveField()
    @Allow(DataHubSecretPermission.Read)
    channels(
        @Ctx() ctx: RequestContext,
        @Parent() secret: MaskedDataHubSecret,
    ): Promise<Channel[]> {
        return this.channelManager.getAssignedChannels(ctx, DataHubSecret, secret.id);
    }
    @Query()
    @Allow(DataHubSecretPermission.Read)
    dataHubSecretSecurity() {
        return {
            mode: this.secretService.getSecurityMode(),
            inlineStorageAvailable: this.secretService.getSecurityMode() !== 'STRICT_DISABLED',
            codeFirstInlineAllowed: this.secretService.isCodeFirstInlineAllowed(),
        };
    }

    @Query()
    @Allow(DataHubSecretPermission.Read)
    async dataHubSecretReferences(
        @Ctx() ctx: RequestContext,
        @Args() args: SecretReferenceArgs,
    ): Promise<PaginatedList<SecretReference>> {
        const search = args.search?.trim() ?? '';
        const skip = args.skip ?? 0;
        const take = args.take ?? SECRET_REFERENCE_PAGING.DEFAULT_TAKE;
        this.assertValidReferencePage(search, skip, take);

        const allConfigReferences = this.secretService.listConfigReferences(ctx);
        const configReferences = search
            ? this.secretService.listConfigReferences(ctx, search)
            : allConfigReferences;
        const configPage = configReferences.slice(skip, skip + take);
        const databaseSkip = Math.max(0, skip - configReferences.length);
        const databaseTake = take - configPage.length;
        const repository = this.connection.getRepository(ctx, DataHubSecret);
        const query = repository
            .createQueryBuilder('secret')
            .innerJoin('secret.channels', 'channel', 'channel.id = :channelId', {
                channelId: ctx.channelId,
            })
            .select(['secret.id', 'secret.code', 'secret.provider'])
            .orderBy('secret.code', 'ASC');

        if (search) {
            query.andWhere('LOWER(secret.code) LIKE :secretSearch', {
                secretSearch: `%${search.toLowerCase()}%`,
            });
        }
        if (allConfigReferences.length > 0) {
            query.andWhere('secret.code NOT IN (:...configSecretCodes)', {
                configSecretCodes: allConfigReferences.map(reference => reference.code),
            });
        }

        const databaseTotal = await query.getCount();
        const databaseItems = databaseTake > 0
            ? await query.skip(databaseSkip).take(databaseTake).getMany()
            : [];

        return {
            items: [
                ...configPage,
                ...databaseItems.map(secret => ({
                    code: secret.code,
                    provider: secret.provider,
                    source: 'database' as const,
                })),
            ],
            totalItems: configReferences.length + databaseTotal,
        };
    }

    private assertValidReferencePage(search: string, skip: number, take: number): void {
        if (search.length > SECRET_REFERENCE_PAGING.MAX_SEARCH_LENGTH) {
            throw new Error(
                `Secret reference search cannot exceed ${SECRET_REFERENCE_PAGING.MAX_SEARCH_LENGTH} characters`,
            );
        }
        if (!Number.isInteger(skip) || skip < 0) {
            throw new Error('Secret reference skip must be a non-negative integer');
        }
        if (
            !Number.isInteger(take)
            || take < 1
            || take > SECRET_REFERENCE_PAGING.MAX_TAKE
        ) {
            throw new Error(
                `Secret reference take must be between 1 and ${SECRET_REFERENCE_PAGING.MAX_TAKE}`,
            );
        }
    }


    @Mutation()
    @Transaction()
    @Allow(DataHubSecretPermission.Create)
    async createDataHubSecret(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: CreateSecretInput },
    ): Promise<MaskedDataHubSecret> {
        assertValidSecretCode(args.input.code);
        if (this.secretService.isConfigSecret(args.input.code)) {
            throw new Error(
                `Secret code "${args.input.code}" is managed by code-first configuration`,
            );
        }
        const provider = normalizeSecretProvider(
            args.input.provider,
            SecretProvider.ENV,
        );
        if (!hasReplacementValue(args.input.value)) {
            throw new Error('A non-empty value is required when creating a secret');
        }
        assertValidProviderValue(provider, args.input.value);
        const storedValue = provider === SecretProvider.ENV
            ? args.input.value
            : await this.secretService.encryptValue(args.input.value);

        const entity = new DataHubSecret();
        entity.code = args.input.code;
        entity.provider = provider;
        entity.value = storedValue;
        entity.metadata = args.input.metadata ?? null;
        await this.managedResourceChannels.assignToCurrentChannel(ctx, entity);

        const saved = await this.connection.getRepository(ctx, DataHubSecret)
            .save(entity);
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
        @Args() args: { input: UpdateSecretInput },
    ): Promise<MaskedDataHubSecret> {
        const repo = this.connection.getRepository(ctx, DataHubSecret);
        const entity = await this.connection.getEntityOrThrow(
            ctx,
            DataHubSecret,
            args.input.id,
            { channelId: ctx.channelId },
        );
        const nextCode = args.input.code ?? entity.code;
        assertValidSecretCode(nextCode);
        if (nextCode !== entity.code) {
            await this.resourceReferences.assertSecretMutable(ctx, entity.code);
        }
        if (this.secretService.isConfigSecret(nextCode)) {
            throw new Error(
                `Secret code "${nextCode}" is managed by code-first configuration and cannot be updated in the database`,
            );
        }
        const nextProvider = normalizeSecretProvider(
            args.input.provider,
            entity.provider,
        );
        const providerChanged = nextProvider !== entity.provider;
        const valueSupplied = args.input.value !== undefined;
        const replacementValue = hasReplacementValue(args.input.value)
            ? args.input.value
            : undefined;
        const hasReplacement = replacementValue !== undefined;
        const clearRequested = args.input.clearValue === true;

        if (clearRequested && valueSupplied) {
            throw new Error('A secret value cannot be replaced and cleared in the same update');
        }
        if (valueSupplied && !hasReplacement) {
            throw new Error('Secret value must be omitted to retain it or be a non-empty replacement');
        }
        if (providerChanged && !hasReplacement) {
            throw new Error('A non-empty value is required when changing the secret provider');
        }

        let storedReplacement: string | undefined;
        if (hasReplacement) {
            assertValidProviderValue(nextProvider, replacementValue);
            storedReplacement = nextProvider === SecretProvider.ENV
                ? replacementValue
                : await this.secretService.encryptValue(replacementValue);
        }

        entity.code = nextCode;
        entity.provider = nextProvider;
        if (clearRequested) {
            entity.value = null;
        } else if (storedReplacement !== undefined) {
            entity.value = storedReplacement;
        }
        if (args.input.metadata !== undefined) {
            entity.metadata = args.input.metadata ?? null;
        }

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
    async deleteDataHubSecret(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
    ): Promise<DeletionResponse> {
        const repo = this.connection.getRepository(ctx, DataHubSecret);
        const visibleSecret = await this.secretService.getById(ctx, String(args.id));
        if (!visibleSecret) {
            return {
                result: DeletionResult.NOT_DELETED,
                message: RESOLVER_ERROR_MESSAGES.SECRET_NOT_FOUND,
            };
        }
        try {
            const plan = await this.managedResourceChannels.prepareDelete(
                ctx,
                DataHubSecret,
                args.id,
            );
            if (plan.physicallyDelete) {
                await this.resourceReferences.assertSecretMutable(ctx, plan.entity.code);
                await repo.remove(plan.entity);
            } else {
                await this.resourceReferences.assertSecretUnassignable(
                    ctx,
                    plan.entity.code,
                );
                await this.managedResourceChannels.removeFromActiveChannel(
                    ctx,
                    DataHubSecret,
                    args.id,
                );
            }
            return { result: DeletionResult.DELETED };
        } catch (error) {
            if (error instanceof ResourceInUseError) {
                return {
                    result: DeletionResult.NOT_DELETED,
                    message: error.message,
                };
            }
            this.logger.error(
                `Failed to delete secret: ${getErrorMessage(error)}`,
            );
            return {
                result: DeletionResult.NOT_DELETED,
                message: RESOLVER_ERROR_MESSAGES.SECRET_DELETE_FAILED,
            };
        }
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubSecretPermission.Update)
    assignDataHubSecretsToChannel(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { secretIds: ID[]; channelId: ID } },
    ): Promise<DataHubSecret[]> {
        return this.channelManager.assignToChannel(
            ctx,
            DataHubSecret,
            { ids: args.input.secretIds, channelId: args.input.channelId },
            [DataHubSecretPermission.Update],
        );
    }

    @Mutation()
    @Transaction()
    @Allow(DataHubSecretPermission.Update)
    removeDataHubSecretsFromChannel(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { secretIds: ID[]; channelId: ID } },
    ): Promise<DataHubSecret[]> {
        return this.channelManager.removeFromChannel(
            ctx,
            DataHubSecret,
            { ids: args.input.secretIds, channelId: args.input.channelId },
            [DataHubSecretPermission.Update],
        );
    }

    private get channelManager(): ManagedResourceChannelService {
        return this.managedResourceChannels;
    }

    private maskSecretValue(secret: DataHubSecret): MaskedDataHubSecret {
        return {
            id: secret.id,
            createdAt: secret.createdAt,
            updatedAt: secret.updatedAt,
            code: secret.code,
            provider: secret.provider,
            hasValue: secret.hasValue,
            valueStatus: this.getValueStatus(secret),
            isOverridden: this.secretService.isConfigSecret(secret.code),
            metadata: secret.metadata,
        };
    }

    private getValueStatus(
        secret: DataHubSecret,
    ): 'MISSING' | 'ENV_REFERENCE' | 'ENCRYPTED' | 'UNENCRYPTED' {
        if (!secret.hasValue) {
            return 'MISSING';
        }
        if (secret.provider === SecretProvider.ENV) {
            return 'ENV_REFERENCE';
        }
        return secret.value && isEncrypted(secret.value)
            ? 'ENCRYPTED'
            : 'UNENCRYPTED';
    }
}
