/**
 * DataHub Seed Data
 *
 * Service for syncing code-first configurations to the database on startup.
 */

import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { TransactionalConnection, RequestContext, RequestContextService, Logger } from '@vendure/core';
import { DATAHUB_PLUGIN_OPTIONS } from '../constants/index';
import { DataHubPluginOptions, CodeFirstPipeline, CodeFirstSecret, CodeFirstConnection } from '../types/index';
import { Pipeline } from '../entities/pipeline/pipeline.entity';
import { DataHubSecret } from '../entities/config/secret.entity';
import { DataHubConnection } from '../entities/config/connection.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * ConfigSyncService syncs code-first configurations to the database on startup.
 * Enables defining pipelines, secrets, and connections in code or config files
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

        try {
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

            // Sync all configurations
            if (secrets.length > 0) {
                await this.syncSecrets(ctx, secrets);
            }
            if (connections.length > 0) {
                await this.syncConnections(ctx, connections);
            }
            if (pipelines.length > 0) {
                await this.syncPipelines(ctx, pipelines);
            }

            if (this.options.debug) {
                Logger.info(`DataHub config sync complete: ${pipelines.length} pipelines, ${secrets.length} secrets, ${connections.length} connections`);
            }
        } catch (e: any) {
            Logger.error(`Failed to sync DataHub config: ${e.message}`);
        }
    }

    private async loadConfigFile(configPath: string): Promise<Partial<DataHubPluginOptions>> {
        try {
            const absolutePath = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
            const content = fs.readFileSync(absolutePath, 'utf-8');
            const ext = path.extname(configPath).toLowerCase();

            if (ext === '.json') {
                return JSON.parse(content);
            } else if (ext === '.yaml' || ext === '.yml') {
                return yaml.load(content) as Partial<DataHubPluginOptions>;
            }
            return {};
        } catch (e: any) {
            Logger.warn(`Could not load config file ${configPath}: ${e.message}`);
            return {};
        }
    }

    private async syncSecrets(ctx: RequestContext, secrets: CodeFirstSecret[]) {
        const repo = this.connection.getRepository(ctx, DataHubSecret);

        for (const secret of secrets) {
            try {
                let existing = await repo.findOne({ where: { code: secret.code } } as any);

                // Resolve value from environment if provider is 'env'
                let resolvedValue = secret.value;
                if (secret.provider === 'env') {
                    resolvedValue = process.env[secret.value] ?? '';
                }

                if (existing) {
                    // Update existing
                    existing.provider = secret.provider;
                    existing.value = resolvedValue;
                    existing.metadata = secret.metadata ?? null;
                    await repo.save(existing);
                } else {
                    // Create new
                    const entity = new DataHubSecret();
                    entity.code = secret.code;
                    entity.provider = secret.provider;
                    entity.value = resolvedValue;
                    entity.metadata = secret.metadata ?? null;
                    await repo.save(entity);
                }
            } catch (e: any) {
                Logger.warn(`Failed to sync secret ${secret.code}: ${e.message}`);
            }
        }
    }

    private async syncConnections(ctx: RequestContext, connections: CodeFirstConnection[]) {
        const repo = this.connection.getRepository(ctx, DataHubConnection);

        for (const conn of connections) {
            try {
                let existing = await repo.findOne({ where: { code: conn.code } } as any);

                // Resolve environment variables in settings
                const resolvedConfig = this.resolveEnvVars(conn.settings);

                if (existing) {
                    existing.type = conn.type;
                    existing.config = resolvedConfig;
                    await repo.save(existing);
                } else {
                    const entity = new DataHubConnection();
                    entity.code = conn.code;
                    entity.type = conn.type;
                    entity.config = resolvedConfig;
                    await repo.save(entity);
                }
            } catch (e: any) {
                Logger.warn(`Failed to sync connection ${conn.code}: ${e.message}`);
            }
        }
    }

    private async syncPipelines(ctx: RequestContext, pipelines: CodeFirstPipeline[]) {
        const repo = this.connection.getRepository(ctx, Pipeline);

        for (const pipeline of pipelines) {
            try {
                // Debug: Log the pipeline definition being synced
                if (this.options.debug) {
                    Logger.info(`[ConfigSync] Syncing pipeline "${pipeline.code}"`, 'DataHub');
                }

                let existing = await repo.findOne({ where: { code: pipeline.code } } as any);

                if (existing) {
                    existing.name = pipeline.name;
                    existing.definition = pipeline.definition as any;
                    existing.enabled = pipeline.enabled ?? true;
                    await repo.save(existing);
                } else {
                    const entity = new Pipeline();
                    entity.code = pipeline.code;
                    entity.name = pipeline.name;
                    entity.definition = pipeline.definition as any;
                    entity.enabled = pipeline.enabled ?? true;
                    await repo.save(entity);
                }
            } catch (e: any) {
                Logger.warn(`Failed to sync pipeline ${pipeline.code}: ${e.message}`);
            }
        }
    }

    /**
     * Resolve ${ENV_VAR} patterns in settings object
     */
    private resolveEnvVars(obj: Record<string, any>): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                // Replace ${VAR_NAME} with environment variable value
                result[key] = value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
                    return process.env[varName] ?? '';
                });
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = this.resolveEnvVars(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }
}
