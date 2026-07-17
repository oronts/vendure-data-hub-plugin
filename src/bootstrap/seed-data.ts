/**
 * DataHub Seed Data
 *
 * Service for syncing database-backed code-first configuration on startup.
 * Implements safe initialization with retry logic and transactional guarantees.
 */

import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { TransactionalConnection, RequestContext, RequestContextService } from '@vendure/core';
import { DATAHUB_PLUGIN_OPTIONS, LOGGER_CONTEXTS, HTTP } from '../constants/index';
import { DataHubPluginOptions, CodeFirstPipeline, CodeFirstConnection } from '../types/index';
import { DataHubConnection } from '../entities/config/connection.entity';
import { DataHubLoggerFactory } from '../services/logger';
import { SecretService } from '../services/config/secret.service';
import { getErrorMessage, toErrorOrUndefined } from '../utils/error.utils';
import { sleep } from '../utils/retry.utils';
import { loadDataHubConfigFile } from '../utils/config-file.utils';
import { assertConnectionCode } from '../services/config/connection.service';
import { assertConnectionConfig, parseConnectionType } from '../services/config/connection-config.validation';
import { ConnectionType } from '../constants/enums';
import { assertValidPipelineCode, normalizePipelineDefinition } from '../services/pipeline/pipeline-policy';
import { validatePipelineDefinition } from '../validation/pipeline-definition.validator';
import { PipelineService } from '../services/pipeline/pipeline.service';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.CONFIG_SYNC);

/** Maximum retry attempts for database operations during bootstrap */
const MAX_BOOTSTRAP_RETRIES = HTTP.MAX_RETRIES;
/** Delay between retry attempts in milliseconds */
const RETRY_DELAY_MS = HTTP.RETRY_DELAY_MS;

class ConfigurationValidationError extends Error {}

function validateCodeFirstConnection(connection: CodeFirstConnection): ConnectionType {
    if (typeof connection.code !== 'string') {
        throw new Error('Connection code must be a string');
    }
    if (typeof connection.type !== 'string') {
        throw new Error(`Connection "${connection.code}" type must be a string`);
    }
    assertConnectionCode(connection.code);
    const type = parseConnectionType(connection.type);
    assertConnectionConfig(type, connection.settings);
    return type;
}

function validateCodeFirstPipeline(pipeline: CodeFirstPipeline): CodeFirstPipeline['definition'] {
    if (typeof pipeline.code !== 'string') {
        throw new Error('Pipeline code must be a string');
    }
    assertValidPipelineCode(pipeline.code);
    if (typeof pipeline.name !== 'string' || pipeline.name.trim() === '') {
        throw new Error(`Pipeline "${pipeline.code}" name must be a non-empty string`);
    }
    if (!pipeline.definition) {
        throw new Error(`Pipeline "${pipeline.code}" definition is required`);
    }
    const definition = normalizePipelineDefinition(pipeline.definition, 1);
    validatePipelineDefinition(definition);
    return definition;
}

/**
 * ConfigSyncService syncs database-backed pipelines and connections on startup.
 * Inline plugin options override file configuration.
 */
@Injectable()
export class ConfigSyncService implements OnApplicationBootstrap {

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private secretService: SecretService,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private pipelineService: PipelineService,
    ) {}

    async onApplicationBootstrap() {
        if (this.options.enabled === false) {
            return;
        }

        // Retry loop to handle race conditions with database readiness
        for (let attempt = 1; attempt <= MAX_BOOTSTRAP_RETRIES; attempt++) {
            try {
                await this.performConfigSync();
                return; // Success, exit retry loop
            } catch (e: unknown) {
                if (e instanceof ConfigurationValidationError) {
                    logger.error('Invalid DataHub code-first configuration', e);
                    throw e;
                }
                const isLastAttempt = attempt === MAX_BOOTSTRAP_RETRIES;
                const errorMessage = getErrorMessage(e);

                if (isLastAttempt) {
                    logger.error('Failed to sync DataHub config after all retries', toErrorOrUndefined(e), {
                        attempts: attempt,
                    });
                    throw e;
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
        const fileConfig = this.options.configPath
            ? loadDataHubConfigFile(this.options.configPath)
            : {};
        const pipelines = [
            ...(fileConfig.pipelines ?? []),
            ...(this.options.pipelines ?? []),
        ];
        const connections = [
            ...(fileConfig.connections ?? []),
            ...(this.options.connections ?? []),
        ];

        const results = {
            secrets: { registered: this.secretService.getConfigSecretCount() },
            connections: { synced: 0, failed: 0 },
            pipelines: { synced: 0, failed: 0 },
        };
        if (connections.length > 0 || pipelines.length > 0) {
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            if (connections.length > 0) {
                results.connections = await this.syncConnections(ctx, connections);
            }
            if (pipelines.length > 0) {
                results.pipelines = await this.syncPipelines(ctx, pipelines);
            }
        }

        if (this.options.debug) {
            logger.info('DataHub config sync complete', {
                secrets: results.secrets,
                connections: results.connections,
                pipelines: results.pipelines,
            });
        }

        const totalFailed = results.connections.failed + results.pipelines.failed;
        if (totalFailed > 0) {
            logger.error('Some configurations failed to sync', undefined, {
                totalFailed,
                results,
            });
            throw new ConfigurationValidationError(
                `Failed to sync ${totalFailed} DataHub configuration records`,
            );
        }
    }


    private async syncConnections(ctx: RequestContext, connections: CodeFirstConnection[]): Promise<{ synced: number; failed: number }> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        let synced = 0;
        let failed = 0;

        for (const conn of connections) {
            let type: ConnectionType;
            try {
                type = validateCodeFirstConnection(conn);
            } catch (error: unknown) {
                logger.warn(`Invalid code-first connection ${String(conn.code)}`, {
                    error: getErrorMessage(error),
                });
                failed++;
                continue;
            }

            const existing = await repo.findOne({ where: { code: conn.code } });
            if (existing) {
                existing.type = type;
                existing.config = conn.settings;
                await repo.save(existing);
            } else {
                const entity = new DataHubConnection();
                entity.code = conn.code;
                entity.type = type;
                entity.config = conn.settings;
                await repo.save(entity);
            }
            synced++;
        }

        return { synced, failed };
    }

    private async syncPipelines(ctx: RequestContext, pipelines: CodeFirstPipeline[]): Promise<{ synced: number; failed: number }> {
        let synced = 0;
        let failed = 0;

        for (const pipeline of pipelines) {
            let definition: CodeFirstPipeline['definition'];
            try {
                definition = validateCodeFirstPipeline(pipeline);
            } catch (error: unknown) {
                logger.warn(`Invalid code-first pipeline ${String(pipeline.code)}`, {
                    error: getErrorMessage(error),
                });
                failed++;
                continue;
            }

            if (this.options.debug) {
                logger.debug(`Syncing pipeline "${pipeline.code}"`);
            }
            const existing = await this.pipelineService.findByCode(ctx, pipeline.code);
            if (existing) {
                await this.pipelineService.update(ctx, {
                    id: existing.id,
                    name: pipeline.name,
                    definition,
                    enabled: pipeline.enabled ?? true,
                });
            } else {
                await this.pipelineService.create(ctx, {
                    code: pipeline.code,
                    name: pipeline.name,
                    definition,
                    enabled: pipeline.enabled ?? true,
                    version: definition.version,
                });
            }
            synced++;
        }

        return { synced, failed };
    }

}
