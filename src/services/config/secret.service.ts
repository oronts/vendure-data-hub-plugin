import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubSecret } from '../../entities/config';
import { DATAHUB_PLUGIN_OPTIONS, LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubPluginOptions, CodeFirstSecret } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { SecretProvider } from '../../constants/enums';
import {
    encryptSecret,
    decryptSecret,
    isEncrypted,
    isEncryptionConfigured,
    getMasterKey,
} from '../../utils/encryption.utils';

/**
 * SecretService handles secure storage and resolution of secrets for DataHub pipelines.
 *
 * Supports multiple providers:
 * - `inline`: Value stored directly in database (encrypted at rest when DATAHUB_MASTER_KEY is set)
 * - `env`: Value read from environment variable at runtime
 * - `config`: Value provided via plugin configuration (code-first)
 *
 * Security:
 * - INLINE secrets are encrypted at rest using AES-256-GCM when DATAHUB_MASTER_KEY is configured
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
export class SecretService implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private configSecrets: Map<string, CodeFirstSecret> = new Map();
    private readonly encryptionEnabled: boolean;

    constructor(
        private connection: TransactionalConnection,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SECRET_SERVICE);
        this.encryptionEnabled = isEncryptionConfigured();
    }

    onModuleInit() {
        // Load secrets from plugin configuration
        if (this.options.secrets) {
            for (const secret of this.options.secrets) {
                this.configSecrets.set(secret.code, secret);
                this.logger.debug(`Registered config secret: ${secret.code}`);
            }
            this.logger.info(`Secret registry initialized`, { recordCount: this.configSecrets.size });
        }

        // Log encryption status
        if (this.encryptionEnabled) {
            this.logger.info('Secret encryption is enabled (DATAHUB_MASTER_KEY configured)');
        } else {
            this.logger.warn(
                'Secret encryption is NOT enabled. Set DATAHUB_MASTER_KEY environment variable ' +
                'to enable encryption at rest for INLINE secrets.',
            );
        }
    }

    /**
     * Check if encryption is enabled for this service
     */
    isEncryptionEnabled(): boolean {
        return this.encryptionEnabled;
    }

    /**
     * Get a secret entity by code (does not resolve the value)
     */
    async getByCode(ctx: RequestContext, code: string): Promise<DataHubSecret | null> {
        return this.connection.getRepository(ctx, DataHubSecret).findOne({ where: { code } });
    }

    /**
     * Get a secret entity by ID
     */
    async getById(ctx: RequestContext, id: string): Promise<DataHubSecret | null> {
        return this.connection.getRepository(ctx, DataHubSecret).findOne({ where: { id } });
    }

    /**
     * Resolve secret value by code.
     *
     * Resolution order:
     * 1. Config secrets (plugin options)
     * 2. Database secrets
     */
    async resolve(ctx: RequestContext, code: string): Promise<string | null> {
        // 1. Check config secrets first (highest priority)
        const configSecret = this.configSecrets.get(code);
        if (configSecret) {
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

    /**
     * Resolve multiple secrets at once.
     * Useful for extractors/loaders that need multiple credentials.
     *
     * @param ctx RequestContext
     * @param codes Array of secret codes
     * @returns Map of code -> resolved value (null if not found)
     */
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

    /**
     * Check if a secret exists (config or database)
     */
    async exists(ctx: RequestContext, code: string): Promise<boolean> {
        if (this.configSecrets.has(code)) {
            return true;
        }
        const dbSecret = await this.getByCode(ctx, code);
        return dbSecret !== null;
    }

    /**
     * List all available secret codes (config + database)
     * Does NOT expose actual values
     */
    async listCodes(ctx: RequestContext): Promise<Array<{ code: string; provider: string; source: 'config' | 'database' }>> {
        const result: Array<{ code: string; provider: string; source: 'config' | 'database' }> = [];

        // Config secrets
        for (const [code, def] of this.configSecrets) {
            result.push({
                code,
                provider: def.provider,
                source: 'config',
            });
        }

        // Database secrets
        const dbSecrets = await this.connection.getRepository(ctx, DataHubSecret).find();
        for (const s of dbSecrets) {
            // Don't duplicate if already in config
            if (!this.configSecrets.has(s.code)) {
                result.push({
                    code: s.code,
                    provider: s.provider,
                    source: 'database',
                });
            }
        }

        return result;
    }

    /**
     * Validate that all required secrets for a pipeline exist.
     *
     * @param ctx RequestContext
     * @param requiredCodes Array of required secret codes
     * @returns Object with valid status and missing codes
     */
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

    // PRIVATE RESOLUTION METHODS

    private resolveConfigSecret(def: CodeFirstSecret): string | null {
        switch (def.provider) {
            case SecretProvider.INLINE:
                return def.value ?? null;

            case SecretProvider.ENV:
                return this.resolveEnvValue(def.value);

            default:
                this.logger.warn(`Unknown provider for config secret ${def.code}: ${def.provider}`);
                return null;
        }
    }

    private resolveDbSecret(secret: DataHubSecret): string | null {
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

    /**
     * Encrypt a secret value for storage.
     * Only encrypts if encryption is configured, otherwise returns as-is.
     */
    encryptValue(plaintext: string): string {
        if (!this.encryptionEnabled) {
            return plaintext;
        }

        const masterKey = getMasterKey();
        if (!masterKey) {
            return plaintext;
        }

        try {
            return encryptSecret(plaintext, masterKey);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.logger.error('Failed to encrypt secret value', error);
            throw new Error('Failed to encrypt secret value');
        }
    }

    /**
     * Decrypt a secret value.
     * Handles both encrypted and unencrypted values for backward compatibility.
     */
    private decryptValue(value: string | null): string | null {
        if (value === null) {
            return null;
        }

        // If not encrypted, return as-is (backward compatibility)
        if (!isEncrypted(value)) {
            return value;
        }

        // Decrypt encrypted value
        const masterKey = getMasterKey();
        if (!masterKey) {
            this.logger.error('Cannot decrypt secret: DATAHUB_MASTER_KEY not configured');
            throw new Error('Cannot decrypt secret: encryption key not configured');
        }

        try {
            return decryptSecret(value, masterKey);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.logger.error('Failed to decrypt secret value', error);
            throw new Error('Failed to decrypt secret value');
        }
    }

    /**
     * Resolve a value from an environment variable.
     * Supports fallback syntax: VAR_NAME|fallback_value
     */
    private resolveEnvValue(envNameOrFallback: string | null): string | null {
        if (!envNameOrFallback) {
            return null;
        }

        // Support fallback syntax: ENV_VAR|default_value
        const [envName, fallback] = envNameOrFallback.split('|').map(s => s.trim());

        const value = process.env[envName];

        if (value !== undefined) {
            return value;
        }

        if (fallback !== undefined) {
            this.logger.debug(`Using fallback for env var ${envName}`);
            return fallback;
        }

        this.logger.warn(`Environment variable not found: ${envName}`);
        return null;
    }
}
