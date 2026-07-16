import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
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
import { RESOLVER_ERROR_MESSAGES, LOGGER_CONTEXTS } from '../../constants/index';
import { getErrorMessage } from '../../utils/error.utils';
import { isEncrypted } from '../../utils/encryption.utils';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { SecretService } from '../../services/config/secret.service';

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

@Resolver()
export class DataHubSecretAdminResolver {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private secretService: SecretService,
        loggerFactory: DataHubLoggerFactory,
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
            { ctx },
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
        const secret = await this.connection.getRepository(ctx, DataHubSecret)
            .findOne({ where: { id: args.id } });
        return secret ? this.maskSecretValue(secret) : null;
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
        );
        const nextCode = args.input.code ?? entity.code;
        assertValidSecretCode(nextCode);
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
        const entity = await this.connection.getEntityOrThrow(
            ctx,
            DataHubSecret,
            args.id,
        );
        try {
            await repo.remove(entity);
            return { result: DeletionResult.DELETED };
        } catch (error) {
            this.logger.error(
                `Failed to delete secret: ${getErrorMessage(error)}`,
            );
            return {
                result: DeletionResult.NOT_DELETED,
                message: 'Failed to delete secret due to an internal error',
            };
        }
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
