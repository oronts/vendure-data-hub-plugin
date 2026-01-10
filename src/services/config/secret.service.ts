import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubSecret } from '../../entities/config';
import { DATAHUB_PLUGIN_OPTIONS, LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubPluginOptions, CodeFirstSecret } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

/**
 * SecretService handles secure storage and resolution of secrets for DataHub pipelines.
 *
 * Supports multiple providers:
 * - `inline`: Value stored directly in database (encrypted at rest recommended)
 * - `env`: Value read from environment variable at runtime
 * - `config`: Value provided via plugin configuration (code-first)
 *
 * Usage in pipelines:
 * ```typescript
 * const apiKey = await secretService.resolve(ctx, 'my-api-key');
 * ```
 */

@Injectable()
export class SecretService implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private configSecrets: Map<string, CodeFirstSecret> = new Map();

    constructor(
        private connection: TransactionalConnection,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SECRET_SERVICE);
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
    }

    /**
     * Get a secret entity by code (does not resolve the value)
     */
    async getByCode(ctx: RequestContext, code: string): Promise<DataHubSecret | null> {
        return this.connection.getRepository(ctx, DataHubSecret).findOne({ where: { code } } as any);
    }

    /**
     * Get a secret entity by ID
     */
    async getById(ctx: RequestContext, id: string): Promise<DataHubSecret | null> {
        return this.connection.getRepository(ctx, DataHubSecret).findOne({ where: { id } } as any);
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
            case 'inline':
                return def.value ?? null;

            case 'env':
                return this.resolveEnvValue(def.value);

            default:
                this.logger.warn(`Unknown provider for config secret ${def.code}: ${def.provider}`);
                return null;
        }
    }

    private resolveDbSecret(secret: DataHubSecret): string | null {
        switch (secret.provider) {
            case 'inline':
                return secret.value;

            case 'env':
                return this.resolveEnvValue(secret.value);

            default:
                this.logger.warn(`Unknown provider for db secret ${secret.code}: ${secret.provider}`);
                return null;
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
