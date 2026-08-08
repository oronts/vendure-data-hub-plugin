import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubSecret } from '../../entities/config';
import { DATAHUB_PLUGIN_OPTIONS, LOGGER_CONTEXTS, SECRET_SECURITY } from '../../constants/index';
import { DataHubPluginOptions, CodeFirstSecret } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { SecretProvider } from '../../constants/enums';
import {
    encryptSecret,
    decryptSecret,
    isEncryptionConfigured,
    isEncrypted,
    getMasterKey,
} from '../../utils/encryption.utils';
import { ensureError } from '../../utils/error.utils';
import { CODE_PATTERN, ENV_VARIABLE_NAME_PATTERN } from '../../../shared';
import { cloneValue } from '../../../shared/utils/lossless-conversion';
import { DEFAULT_CHANNEL_CODE } from '../../../shared/constants';
import { loadDataHubConfigFile } from '../../utils/config-file.utils';
export type SecretSecurityMode =
    | 'ENCRYPTED'
    | 'STRICT_DISABLED';

export interface SecretCodeReference {
    code: string;
    provider: string;
    source: 'config' | 'database';
}

const MAX_CODE_FIRST_SECRET_CHANNELS = 100;


/**
 * Secure storage and resolution of secrets for DataHub pipelines.
 *
 * Supports multiple providers:
 * - `inline`: Database values require DATAHUB_MASTER_KEY and are encrypted at rest
 * - `env`: Value read from environment variable at runtime
 * - `config`: Value provided via plugin configuration (code-first)
 *
 * Security:
 * - Database INLINE secrets fail closed without a valid DATAHUB_MASTER_KEY
 * - Unencrypted database INLINE values are never stored or resolved
 * - Secrets are only decrypted in memory when resolved
 * - Environment variable secrets are never stored, only referenced
 *
 * Usage in pipelines:
 * ```typescript
 * const apiKey = await secretService.resolve(ctx, 'my-api-key');
 * ```
 *
 * @example Configuring encryption
 * ```bash
 * # Generate a master key
 * export DATAHUB_MASTER_KEY=$(openssl rand -hex 32)
 * ```
 */

@Injectable()
export class SecretService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private configSecrets = new Map<string, Readonly<CodeFirstSecret>>();
    private readonly encryptionEnabled: boolean;
    private readonly isProduction: boolean;

    constructor(
        private connection: TransactionalConnection,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SECRET_SERVICE);
        this.encryptionEnabled = isEncryptionConfigured();
        this.isProduction =
            process.env[SECRET_SECURITY.NODE_ENV]?.trim().toLowerCase() ===
            SECRET_SECURITY.PRODUCTION_ENV;
    }

    onModuleInit(): void {
        if (this.options.enabled === false) {
            return;
        }

        const fileOptions = this.options.configPath
            ? loadDataHubConfigFile(this.options.configPath)
            : {};
        const secrets = this.mergeSecretSources(
            fileOptions.secrets ?? [],
            this.options.secrets ?? [],
        );
        this.replaceConfigSecrets(secrets);
        if (secrets.length > 0) {
            this.logger.info('Secret registry initialized', {
                recordCount: this.configSecrets.size,
            });
        }

        if (this.encryptionEnabled) {
            this.logger.info('Secret encryption is enabled (DATAHUB_MASTER_KEY configured)');
        } else {
            this.logger.warn(
                'INLINE secret storage and resolution are disabled until DATAHUB_MASTER_KEY is configured',
            );
        }
    }

    replaceConfigSecrets(secrets: readonly CodeFirstSecret[]): number {
        const nextSecrets = new Map<string, Readonly<CodeFirstSecret>>();
        for (const secret of secrets) {
            this.validateConfigSecret(secret);
            if (nextSecrets.has(secret.code)) {
                throw new Error(`Duplicate code-first secret code: "${secret.code}"`);
            }
            const normalized = Object.freeze({
                ...secret,
                value: secret.provider === 'ENV' ? secret.value.trim() : secret.value,
                channelCodes: secret.channelCodes === undefined
                    ? undefined
                    : Object.freeze([...secret.channelCodes]),
                metadata: secret.metadata === undefined
                    ? undefined
                    : cloneValue(secret.metadata),
            });
            nextSecrets.set(secret.code, normalized);
        }

        this.configSecrets = nextSecrets;
        for (const code of nextSecrets.keys()) {
            this.logger.debug(`Registered config secret: ${code}`);
        }
        return nextSecrets.size;
    }

    getConfigSecretCount(): number {
        return this.configSecrets.size;
    }

    isConfigSecret(code: string): boolean {
        return this.configSecrets.has(code);
    }

    private mergeSecretSources(
        fileSecrets: readonly CodeFirstSecret[],
        pluginSecrets: readonly CodeFirstSecret[],
    ): CodeFirstSecret[] {
        this.assertUniqueSecretCodes(fileSecrets, 'config file');
        this.assertUniqueSecretCodes(pluginSecrets, 'plugin options');

        const merged = new Map<string, CodeFirstSecret>();
        for (const secret of fileSecrets) {
            merged.set(secret.code, secret);
        }
        for (const secret of pluginSecrets) {
            merged.set(secret.code, secret);
        }
        return [...merged.values()];
    }

    private assertUniqueSecretCodes(
        secrets: readonly CodeFirstSecret[],
        source: string,
    ): void {
        const codes = new Set<string>();
        for (const secret of secrets) {
            if (codes.has(secret.code)) {
                throw new Error(
                    `Duplicate code-first secret code "${secret.code}" in ${source}`,
                );
            }
            codes.add(secret.code);
        }
    }

    onModuleDestroy() {
        this.configSecrets.clear();
    }

    isEncryptionEnabled(): boolean {
        return this.encryptionEnabled;
    }

    getSecurityMode(): SecretSecurityMode {
        if (this.encryptionEnabled) {
            return 'ENCRYPTED';
        }
        return 'STRICT_DISABLED';
    }

    isCodeFirstInlineAllowed(): boolean {
        return !this.isProduction && this.encryptionEnabled;
    }

    async getByCode(ctx: RequestContext, code: string): Promise<DataHubSecret | null> {
        return this.connection.getRepository(ctx, DataHubSecret).findOne({
            where: { code, channels: { id: ctx.channelId } },
        });
    }

    async getById(ctx: RequestContext, id: string): Promise<DataHubSecret | null> {
        return this.connection.findOneInChannel(
            ctx,
            DataHubSecret,
            id,
            ctx.channelId,
            { relations: ['channels'] },
        ).then(entity => entity ?? null);
    }

    /** Resolution order: 1. Config secrets, 2. Database secrets */
    async resolve(ctx: RequestContext, code: string): Promise<string | null> {
        // 1. Check config secrets first (highest priority)
        const configSecret = this.configSecrets.get(code);
        if (configSecret && this.isConfigSecretVisible(ctx, configSecret)) {
            return this.resolveConfigSecret(configSecret);
        }

        // 2. Check database secrets
        const dbSecret = await this.getByCode(ctx, code);
        if (dbSecret) {
            return this.resolveDbSecret(dbSecret);
        }

        this.logger.warn(`Secret not found: ${code}`);
        return null;
    }

    async resolveMany(ctx: RequestContext, codes: string[]): Promise<Map<string, string | null>> {
        const results = new Map<string, string | null>();

        await Promise.all(
            codes.map(async code => {
                const value = await this.resolve(ctx, code);
                results.set(code, value);
            }),
        );

        return results;
    }

    async exists(ctx: RequestContext, code: string): Promise<boolean> {
        const configSecret = this.configSecrets.get(code);
        if (configSecret && this.isConfigSecretVisible(ctx, configSecret)) {
            return true;
        }
        const dbSecret = await this.getByCode(ctx, code);
        return dbSecret !== null;
    }

    listConfigReferences(
        ctx: RequestContext,
        searchTerm = '',
    ): SecretCodeReference[] {
        const search = searchTerm.trim().toLowerCase();
        return [...this.configSecrets.entries()]
            .filter(([code, definition]) => (
                this.isConfigSecretVisible(ctx, definition)
                && (!search || code.toLowerCase().includes(search))
            ))
            .map(([code, definition]) => ({
                code,
                provider: definition.provider,
                source: 'config' as const,
            }))
            .sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 : 0);
    }

    private isConfigSecretVisible(
        ctx: RequestContext,
        definition: Readonly<CodeFirstSecret>,
    ): boolean {
        return ctx.channel.code === DEFAULT_CHANNEL_CODE
            || definition.channelCodes?.includes(ctx.channel.code) === true;
    }

    async validateSecrets(
        ctx: RequestContext,
        requiredCodes: string[],
    ): Promise<{ valid: boolean; missing: string[] }> {
        const missing: string[] = [];

        for (const code of requiredCodes) {
            const exists = await this.exists(ctx, code);
            if (!exists) {
                missing.push(code);
            }
        }

        return {
            valid: missing.length === 0,
            missing,
        };
    }

    private validateConfigSecret(def: Readonly<CodeFirstSecret>): void {
        if (
            typeof def.code !== 'string' ||
            def.code.trim() !== def.code ||
            !CODE_PATTERN.test(def.code)
        ) {
            throw new Error(
                'Secret codes must start with a letter and contain only letters, numbers, hyphens, and underscores',
            );
        }
        if ((def.channelCodes?.length ?? 0) > MAX_CODE_FIRST_SECRET_CHANNELS) {
            throw new Error(
                `Secret "${def.code}" cannot target more than ${MAX_CODE_FIRST_SECRET_CHANNELS} channels`,
            );
        }
        const channelCodes = new Set<string>();
        for (const channelCode of def.channelCodes ?? []) {
            if (
                typeof channelCode !== 'string'
                || channelCode.trim() !== channelCode
                || !CODE_PATTERN.test(channelCode)
            ) {
                throw new Error(
                    `Secret "${def.code}" contains an invalid channel code`,
                );
            }
            if (channelCode === DEFAULT_CHANNEL_CODE) {
                throw new Error(
                    `Secret "${def.code}" does not need to declare the default channel`,
                );
            }
            if (channelCodes.has(channelCode)) {
                throw new Error(
                    `Secret "${def.code}" contains duplicate channel code "${channelCode}"`,
                );
            }
            channelCodes.add(channelCode);
        }

        switch (def.provider) {
            case 'INLINE':
                if (!def.value) {
                    throw new Error(`INLINE secret "${def.code}" requires a non-empty value`);
                }
                if (this.isProduction) {
                    throw new Error(
                        `Code-first INLINE secret "${def.code}" is not allowed in production; use ENV`,
                    );
                }
                if (!this.encryptionEnabled) {
                    throw new Error(
                        `INLINE secret "${def.code}" requires DATAHUB_MASTER_KEY`,
                    );
                }
                return;
            case 'ENV':
                if (
                    !def.value ||
                    !ENV_VARIABLE_NAME_PATTERN.test(def.value.trim())
                ) {
                    throw new Error(
                        `ENV secret "${def.code}" must reference one environment variable name`,
                    );
                }
                return;
            default:
                throw new Error(
                    `Secret "${def.code}" has unsupported provider "${String(def.provider)}"`,
                );
        }
    }

    private resolveConfigSecret(def: CodeFirstSecret): string | null {
        switch (def.provider) {
            case 'INLINE':
                return def.value ?? null;

            case 'ENV':
                return this.resolveEnvValue(def.value);

            default:
                this.logger.warn(`Unknown provider for config secret ${def.code}: ${def.provider}`);
                return null;
        }
    }

    private async resolveDbSecret(secret: DataHubSecret): Promise<string | null> {
        switch (secret.provider) {
            case SecretProvider.INLINE:
                return this.decryptValue(secret.value);

            case SecretProvider.ENV:
                return this.resolveEnvValue(secret.value);

            default:
                this.logger.warn(`Unknown provider for db secret ${secret.code}: ${secret.provider}`);
                return null;
        }
    }

    /** Encrypts INLINE values or rejects storage when no secure mode is configured. */
    async encryptValue(plaintext: string): Promise<string> {
        if (!this.encryptionEnabled) {
            throw new Error(
                `INLINE secrets require ${SECRET_SECURITY.MASTER_KEY_ENV}`,
            );
        }

        const masterKey = getMasterKey();
        if (!masterKey) {
            throw new Error('Encryption key is required but not available');
        }

        try {
            return await encryptSecret(plaintext, masterKey);
        } catch (err) {
            const error = ensureError(err);
            this.logger.error('Failed to encrypt secret value', error);
            throw new Error('Failed to encrypt secret value');
        }
    }

    private async decryptValue(value: string | null): Promise<string | null> {
        if (value === null) {
            return null;
        }

        if (!isEncrypted(value)) {
            this.logger.error('Refusing to resolve an unencrypted INLINE secret');
            throw new Error('Cannot resolve unencrypted INLINE secret');
        }

        if (!this.encryptionEnabled) {
            this.logger.error('Cannot decrypt secret: DATAHUB_MASTER_KEY not configured');
            throw new Error('Cannot decrypt secret: encryption key not configured');
        }

        const masterKey = getMasterKey();
        if (!masterKey) {
            this.logger.error('Cannot decrypt secret: DATAHUB_MASTER_KEY not configured');
            throw new Error('Cannot decrypt secret: encryption key not configured');
        }

        try {
            return await decryptSecret(value, masterKey);
        } catch (err) {
            const error = ensureError(err);
            this.logger.error('Failed to decrypt secret value', error);
            throw new Error('Failed to decrypt secret value');
        }
    }

    private resolveEnvValue(envNameValue: string | null): string | null {
        if (!envNameValue) {
            return null;
        }

        const envName = envNameValue.trim();
        if (!ENV_VARIABLE_NAME_PATTERN.test(envName)) {
            this.logger.error('Invalid environment variable secret reference', undefined, {
                envName,
            });
            throw new Error(
                'ENV secrets must reference exactly one environment variable name',
            );
        }

        const value = process.env[envName];
        if (value !== undefined) {
            return value;
        }

        this.logger.warn(`Environment variable not found: ${envName}`);
        return null;
    }
}
