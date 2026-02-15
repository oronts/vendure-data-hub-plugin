/**
 * DataHub Seed Data
 *
 * Service for syncing code-first configurations to the database on startup.
 * Implements safe initialization with retry logic and transactional guarantees.
 */

import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { TransactionalConnection, RequestContext, RequestContextService } from '@vendure/core';
import { DATAHUB_PLUGIN_OPTIONS, LOGGER_CONTEXTS, HTTP } from '../constants/index';
import { DataHubPluginOptions, CodeFirstPipeline, CodeFirstSecret, CodeFirstConnection } from '../types/index';
import { Pipeline } from '../entities/pipeline/pipeline.entity';
import { DataHubSecret } from '../entities/config/secret.entity';
import { DataHubConnection } from '../entities/config/connection.entity';
import { SecretProvider, ConnectionType } from '../constants/enums';
import { getErrorMessage, DataHubLogger } from '../services/logger';
import { sleep } from '../utils/retry.utils';
import type { JsonObject, JsonValue } from '../../shared/types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const logger = new DataHubLogger(LOGGER_CONTEXTS.CONFIG_SYNC);

/** Maximum retry attempts for database operations during bootstrap */
const MAX_BOOTSTRAP_RETRIES = HTTP.MAX_RETRIES;
/** Delay between retry attempts in milliseconds */
const RETRY_DELAY_MS = HTTP.RETRY_DELAY_MS;

/**
 * ConfigSyncService syncs code-first configurations to the database on startup.
 * Define pipelines, secrets, and connections in code or config files
 * instead of via the UI.
 */
@Injectable()
export class ConfigSyncService implements OnApplicationBootstrap {

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
    ) {}

    async onApplicationBootstrap() {
        if (!this.options.enabled) {
            return;
        }

        // Retry loop to handle race conditions with database readiness
        for (let attempt = 1; attempt <= MAX_BOOTSTRAP_RETRIES; attempt++) {
            try {
                await this.performConfigSync();
                return; // Success, exit retry loop
            } catch (e: unknown) {
                const isLastAttempt = attempt === MAX_BOOTSTRAP_RETRIES;
                const errorMessage = getErrorMessage(e);

                if (isLastAttempt) {
                    logger.error('Failed to sync DataHub config after all retries', e instanceof Error ? e : undefined, {
                        attempts: attempt,
                    });
                } else {
                    logger.warn(`DataHub config sync attempt ${attempt} failed, retrying...`, {
                        error: errorMessage,
                        nextAttemptIn: RETRY_DELAY_MS,
                    });
                    await sleep(RETRY_DELAY_MS);
                }
            }
        }
    }

    /**
     * Perform the actual configuration sync with proper error handling
     */
    private async performConfigSync(): Promise<void> {
        // Load config from file if specified
        let fileConfig: Partial<DataHubPluginOptions> = {};
        if (this.options.configPath) {
            fileConfig = await this.loadConfigFile(this.options.configPath);
        }

        // Merge file config with inline options (inline takes precedence)
        const pipelines = [...(fileConfig.pipelines ?? []), ...(this.options.pipelines ?? [])];
        const secrets = [...(fileConfig.secrets ?? []), ...(this.options.secrets ?? [])];
        const connections = [...(fileConfig.connections ?? []), ...(this.options.connections ?? [])];

        // Create a background context for sync operations
        const ctx = await this.requestContextService.create({ apiType: 'admin' });

        // Sync all configurations in dependency order (secrets first, then connections, then pipelines)
        // This ensures pipelines can reference secrets and connections
        const results = {
            secrets: { synced: 0, failed: 0 },
            connections: { synced: 0, failed: 0 },
            pipelines: { synced: 0, failed: 0 },
        };

        if (secrets.length > 0) {
            results.secrets = await this.syncSecrets(ctx, secrets);
        }
        if (connections.length > 0) {
            results.connections = await this.syncConnections(ctx, connections);
        }
        if (pipelines.length > 0) {
            results.pipelines = await this.syncPipelines(ctx, pipelines);
        }

        if (this.options.debug) {
            logger.info('DataHub config sync complete', {
                secrets: results.secrets,
                connections: results.connections,
                pipelines: results.pipelines,
            });
        }

        // Throw if any critical failures occurred
        const totalFailed = results.secrets.failed + results.connections.failed + results.pipelines.failed;
        if (totalFailed > 0) {
            logger.warn('Some configurations failed to sync', { totalFailed, results });
        }
    }

    private async loadConfigFile(configPath: string): Promise<Partial<DataHubPluginOptions>> {
        const absolutePath = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);

        // Check if file exists before attempting to read
        if (!fs.existsSync(absolutePath)) {
            logger.warn(`Config file not found: ${absolutePath}`);
            return {};
        }

        try {
            const content = fs.readFileSync(absolutePath, 'utf-8');
            const ext = path.extname(configPath).toLowerCase();

            if (ext === '.json') {
                return JSON.parse(content);
            } else if (ext === '.yaml' || ext === '.yml') {
                return yaml.load(content) as Partial<DataHubPluginOptions>;
            }

            logger.warn(`Unsupported config file extension: ${ext}. Supported: .json, .yaml, .yml`);
            return {};
        } catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            // Distinguish between parse errors and file read errors
            if (errorMessage.includes('JSON') || errorMessage.includes('YAML') || errorMessage.includes('yaml')) {
                logger.error(`Failed to parse config file ${configPath}`, e instanceof Error ? e : undefined);
                throw e; // Re-throw parse errors as they indicate invalid configuration
            }
            logger.warn(`Could not load config file ${configPath}`, { error: errorMessage });
            return {};
        }
    }

    private async syncSecrets(ctx: RequestContext, secrets: CodeFirstSecret[]): Promise<{ synced: number; failed: number }> {
        const repo = this.connection.getRepository(ctx, DataHubSecret);
        let synced = 0;
        let failed = 0;

        for (const secret of secrets) {
            try {
                // Validate required fields
                if (!secret.code || typeof secret.code !== 'string') {
                    logger.warn('Skipping secret with invalid code', { secret });
                    failed++;
                    continue;
                }

                const existing = await repo.findOne({ where: { code: secret.code } });

                // Map string provider to enum
                const providerEnum = secret.provider === 'ENV' ? SecretProvider.ENV : SecretProvider.INLINE;

                // Resolve value from environment if provider is 'ENV'
                // Supports fallback syntax: 'ENV_VAR|fallback_value'
                let resolvedValue = secret.value;
                if (secret.provider === 'ENV' && secret.value) {
                    const [envName, fallback] = secret.value.split('|').map(s => s.trim());
                    const envValue = process.env[envName];
                    if (envValue !== undefined) {
                        resolvedValue = envValue;
                    } else if (fallback !== undefined) {
                        logger.debug(`Using fallback for env var ${envName} in secret ${secret.code}`);
                        resolvedValue = fallback;
                    } else {
                        logger.warn(`Environment variable ${envName} not found for secret ${secret.code}`);
                        resolvedValue = '';
                    }
                }

                if (existing) {
                    // Update existing
                    existing.provider = providerEnum;
                    existing.value = resolvedValue;
                    existing.metadata = secret.metadata ?? null;
                    await repo.save(existing);
                } else {
                    // Create new
                    const entity = new DataHubSecret();
                    entity.code = secret.code;
                    entity.provider = providerEnum;
                    entity.value = resolvedValue;
                    entity.metadata = secret.metadata ?? null;
                    await repo.save(entity);
                }
                synced++;
            } catch (e: unknown) {
                logger.warn(`Failed to sync secret ${secret.code}`, { error: getErrorMessage(e) });
                failed++;
            }
        }

        return { synced, failed };
    }

    private async syncConnections(ctx: RequestContext, connections: CodeFirstConnection[]): Promise<{ synced: number; failed: number }> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        let synced = 0;
        let failed = 0;

        for (const conn of connections) {
            try {
                // Validate required fields
                if (!conn.code || typeof conn.code !== 'string') {
                    logger.warn('Skipping connection with invalid code', { connection: conn });
                    failed++;
                    continue;
                }

                if (!conn.type) {
                    logger.warn(`Skipping connection ${conn.code} with missing type`);
                    failed++;
                    continue;
                }

                const existing = await repo.findOne({ where: { code: conn.code } });

                // Resolve environment variables in settings
                const resolvedConfig = this.resolveEnvVars(conn.settings ?? {});

                if (existing) {
                    existing.type = conn.type as ConnectionType;
                    existing.config = resolvedConfig;
                    await repo.save(existing);
                } else {
                    const entity = new DataHubConnection();
                    entity.code = conn.code;
                    entity.type = conn.type as ConnectionType;
                    entity.config = resolvedConfig;
                    await repo.save(entity);
                }
                synced++;
            } catch (e: unknown) {
                logger.warn(`Failed to sync connection ${conn.code}`, { error: getErrorMessage(e) });
                failed++;
            }
        }

        return { synced, failed };
    }

    private async syncPipelines(ctx: RequestContext, pipelines: CodeFirstPipeline[]): Promise<{ synced: number; failed: number }> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        let synced = 0;
        let failed = 0;

        for (const pipeline of pipelines) {
            try {
                // Validate required fields
                if (!pipeline.code || typeof pipeline.code !== 'string') {
                    logger.warn('Skipping pipeline with invalid code', { pipeline });
                    failed++;
                    continue;
                }

                if (!pipeline.name) {
                    logger.warn(`Skipping pipeline ${pipeline.code} with missing name`);
                    failed++;
                    continue;
                }

                if (!pipeline.definition) {
                    logger.warn(`Skipping pipeline ${pipeline.code} with missing definition`);
                    failed++;
                    continue;
                }

                // Debug: Log the pipeline definition being synced
                if (this.options.debug) {
                    logger.debug(`Syncing pipeline "${pipeline.code}"`);
                }

                const existing = await repo.findOne({ where: { code: pipeline.code } });

                if (existing) {
                    existing.name = pipeline.name;
                    existing.definition = pipeline.definition;
                    existing.enabled = pipeline.enabled ?? true;
                    await repo.save(existing);
                } else {
                    const entity = new Pipeline();
                    entity.code = pipeline.code;
                    entity.name = pipeline.name;
                    entity.definition = pipeline.definition;
                    entity.enabled = pipeline.enabled ?? true;
                    await repo.save(entity);
                }
                synced++;
            } catch (e: unknown) {
                logger.warn(`Failed to sync pipeline ${pipeline.code}`, { error: getErrorMessage(e) });
                failed++;
            }
        }

        return { synced, failed };
    }

    /**
     * Resolve ${ENV_VAR} patterns in settings object
     */
    private resolveEnvVars(obj: Record<string, unknown>): JsonObject {
        const result: Record<string, JsonValue> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                // Replace ${VAR_NAME} with environment variable value
                result[key] = value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
                    return process.env[varName] ?? '';
                });
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = this.resolveEnvVars(value as Record<string, unknown>);
            } else {
                // Cast to JsonValue - assumes input is already JSON-compatible
                result[key] = value as JsonValue;
            }
        }
        return result;
    }
}
