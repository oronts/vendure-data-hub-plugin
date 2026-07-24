/**
 * DataHub Seed Data
 *
 * Service for syncing database-backed code-first configuration on startup.
 * Implements serialized reconciliation with validation and retry handling.
 */

import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { ProcessContext, RequestContext, RequestContextService } from '@vendure/core';
import { isDeepStrictEqual } from 'node:util';
import { DATAHUB_PLUGIN_OPTIONS, LOGGER_CONTEXTS, HTTP } from '../constants/index';
import { DataHubPluginOptions, CodeFirstPipeline, CodeFirstConnection } from '../types/index';
import { DataHubLoggerFactory } from '../services/logger';
import { SecretService } from '../services/config/secret.service';
import { getErrorMessage, toErrorOrUndefined } from '../utils/error.utils';
import { sleep } from '../utils/retry.utils';
import { loadDataHubConfigFile } from '../utils/config-file.utils';
import { assertConnectionCode, ConnectionService } from '../services/config/connection.service';
import { assertConnectionConfig, parseConnectionType } from '../services/config/connection-config.validation';
import { ManagedResourceChannelService } from '../services/config/managed-resource-channel.service';
import { ConfigurationSource, ConnectionType, PipelineStatus } from '../constants/enums';
import { assertValidPipelineCode, definitionsEqual, normalizePipelineDefinition } from '../services/pipeline/pipeline-policy';
import { validatePipelineDefinition } from '../validation/pipeline-definition.validator';
import { PipelineService } from '../services/pipeline/pipeline.service';
import { DistributedLockService } from '../services/runtime/distributed-lock.service';
import { DISTRIBUTED_LOCK } from '../constants/defaults/reliability-defaults';
import { DataHubRegistryService } from '../sdk/registry.service';
import { withEffectivePipelineCapabilities } from '../services/pipeline/pipeline-capabilities';
import {
    collectAdapterUsages,
    validateAdapterBindings,
    withResolvedAdapterBindings,
} from '../sdk/adapter-bindings';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.CONFIG_SYNC);

/** Maximum retry attempts for database operations during bootstrap */
const MAX_BOOTSTRAP_RETRIES = HTTP.MAX_RETRIES;
/** Delay between retry attempts in milliseconds */
const RETRY_DELAY_MS = HTTP.RETRY_DELAY_MS;

class ConfigurationValidationError extends Error {}

function mergeByCode<T extends { code: string }>(fileEntries: T[], inlineEntries: T[]): T[] {
    const entries = new Map<string, T>();
    for (const entry of [...fileEntries, ...inlineEntries]) {
        entries.set(entry.code, entry);
    }
    return Array.from(entries.values());
}

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
    private synchronization?: Promise<void>;

    constructor(
        private requestContextService: RequestContextService,
        private secretService: SecretService,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private connectionService: ConnectionService,
        private pipelineService: PipelineService,
        private processContext: ProcessContext,
        private distributedLock: DistributedLockService,
        private registry: DataHubRegistryService,
        private managedResourceChannels: ManagedResourceChannelService,
    ) {}

    onApplicationBootstrap(): Promise<void> {
        return this.ensureSynchronized();
    }

    ensureSynchronized(): Promise<void> {
        this.synchronization ??= this.runSynchronization();
        return this.synchronization;
    }

    private async runSynchronization(): Promise<void> {
        if (this.options.enabled === false) {
            return;
        }
        if (!this.processContext.isServer) {
            await this.waitForPersistedConfiguration();
            return;
        }

        // Retry loop to handle race conditions with database readiness
        for (let attempt = 1; attempt <= MAX_BOOTSTRAP_RETRIES; attempt++) {
            try {
                await this.performLockedConfigSync();
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

    private async performLockedConfigSync(): Promise<void> {
        const lock = await this.distributedLock.acquire(DISTRIBUTED_LOCK.CONFIG_SYNC_LOCK_KEY, {
            ttlMs: DISTRIBUTED_LOCK.CONFIG_SYNC_LOCK_TTL_MS,
            waitForLock: true,
            waitTimeoutMs: DISTRIBUTED_LOCK.CONFIG_SYNC_LOCK_WAIT_TIMEOUT_MS,
        });
        if (!lock.acquired || !lock.token) {
            throw new Error('Could not acquire the DataHub configuration sync lock');
        }

        try {
            await this.performConfigSync();
        } finally {
            await this.distributedLock.release(
                DISTRIBUTED_LOCK.CONFIG_SYNC_LOCK_KEY,
                lock.token,
            ).catch(error => logger.warn('Failed to release DataHub configuration sync lock', {
                error: getErrorMessage(error),
            }));
        }
    }

    /**
     * Perform the actual configuration sync with proper error handling
     */
    private async performConfigSync(): Promise<void> {
        const { connections, pipelines } = this.loadEffectiveConfiguration();

        const results = {
            secrets: { registered: this.secretService.getConfigSecretCount() },
            connections: { synced: 0, failed: 0, released: 0 },
            pipelines: { synced: 0, failed: 0, released: 0 },
        };
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        await this.managedResourceChannels.initializeDefaultChannel(ctx);
        if (connections.length > 0) {
            const syncResult = await this.syncConnections(ctx, connections);
            results.connections.synced = syncResult.synced;
            results.connections.failed = syncResult.failed;
        }
        if (pipelines.length > 0) {
            const syncResult = await this.syncPipelines(ctx, pipelines);
            results.pipelines.synced = syncResult.synced;
            results.pipelines.failed = syncResult.failed;
        }
        results.connections.released = await this.connectionService.releaseCodeFirstOwnership(
            ctx,
            new Set(connections.map(connection => connection.code)),
        );
        results.pipelines.released = await this.pipelineService.releaseCodeFirstOwnership(
            ctx,
            new Set(pipelines.map(pipeline => pipeline.code)),
        );

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

    private loadEffectiveConfiguration(): {
        connections: CodeFirstConnection[];
        pipelines: CodeFirstPipeline[];
    } {
        const fileConfig = this.options.configPath
            ? loadDataHubConfigFile(this.options.configPath)
            : {};
        const pipelines = mergeByCode(
            fileConfig.pipelines ?? [],
            this.options.pipelines ?? [],
        );
        const connections = mergeByCode(
            fileConfig.connections ?? [],
            this.options.connections ?? [],
        );
        this.validateConfiguration(connections, pipelines);
        return { connections, pipelines };
    }

    private async waitForPersistedConfiguration(): Promise<void> {
        const { connections, pipelines } = this.loadEffectiveConfiguration();
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const deadline = Date.now() + DISTRIBUTED_LOCK.CONFIG_SYNC_READINESS_TIMEOUT_MS;
        let mismatches = this.configurationCodes(connections, pipelines);
        let lastError: string | undefined;

        while (Date.now() < deadline) {
            try {
                mismatches = await this.findConfigurationMismatches(
                    ctx,
                    connections,
                    pipelines,
                );
                const unassigned = await this.managedResourceChannels.countUnassigned(ctx);
                if (unassigned > 0) {
                    mismatches.push(`channel-backfill:${unassigned}`);
                }
                lastError = undefined;
                if (mismatches.length === 0) {
                    return;
                }
            } catch (error: unknown) {
                lastError = getErrorMessage(error);
            }
            await sleep(DISTRIBUTED_LOCK.CONFIG_SYNC_READINESS_POLL_INTERVAL_MS);
        }

        const details = lastError
            ? `${mismatches.join(', ')}; last lookup error: ${lastError}`
            : mismatches.join(', ');
        throw new Error(
            `Timed out waiting for server-owned DataHub configuration sync: ${details}`,
        );
    }

    private configurationCodes(
        connections: CodeFirstConnection[],
        pipelines: CodeFirstPipeline[],
    ): string[] {
        return [
            ...connections.map(connection => `connection:${connection.code}`),
            ...pipelines.map(pipeline => `pipeline:${pipeline.code}`),
        ];
    }

    private async findConfigurationMismatches(
        ctx: RequestContext,
        connections: CodeFirstConnection[],
        pipelines: CodeFirstPipeline[],
    ): Promise<string[]> {
        const mismatches: string[] = [];
        for (const connection of connections) {
            const type = validateCodeFirstConnection(connection);
            const existing = await this.connectionService.getByCode(ctx, connection.code);
            if (
                !existing
                || existing.configurationSource !== ConfigurationSource.CODE_FIRST
                || existing.type !== type
                || !isDeepStrictEqual(existing.config, connection.settings)
            ) {
                mismatches.push(`connection:${connection.code}`);
            }
        }
        for (const pipeline of pipelines) {
            const definition = this.getEffectivePipelineDefinition(pipeline);
            const existing = await this.pipelineService.findByCode(ctx, pipeline.code);
            if (
                !existing
                || existing.configurationSource !== ConfigurationSource.CODE_FIRST
                || existing.name !== pipeline.name
                || existing.enabled !== (pipeline.enabled ?? true)
                || !definitionsEqual(existing.definition, definition)
            ) {
                mismatches.push(`pipeline:${pipeline.code}`);
            }
        }
        return mismatches;
    }

    private validateConfiguration(
        connections: CodeFirstConnection[],
        pipelines: CodeFirstPipeline[],
    ): void {
        const failures: string[] = [];
        for (const connection of connections) {
            try {
                validateCodeFirstConnection(connection);
            } catch (error: unknown) {
                failures.push(`Connection ${String(connection.code)}: ${getErrorMessage(error)}`);
            }
        }
        for (const pipeline of pipelines) {
            try {
                validateCodeFirstPipeline(pipeline);
            } catch (error: unknown) {
                failures.push(`Pipeline ${String(pipeline.code)}: ${getErrorMessage(error)}`);
            }
        }
        if (failures.length > 0) {
            throw new ConfigurationValidationError(failures.join('\n'));
        }
    }


    private async syncConnections(ctx: RequestContext, connections: CodeFirstConnection[]): Promise<{ synced: number; failed: number }> {
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

            const existing = await this.connectionService.getByCode(ctx, conn.code);
            if (existing) {
                if (
                    existing.configurationSource === ConfigurationSource.CODE_FIRST
                    && existing.type === type
                    && isDeepStrictEqual(existing.config, conn.settings)
                ) {
                    synced++;
                    continue;
                }
                const updated = await this.connectionService.update(ctx, existing.id, {
                    type,
                    config: conn.settings,
                }, {
                    configurationSource: ConfigurationSource.CODE_FIRST,
                    allowCodeFirstManaged: true,
                });
                if (!updated) {
                    throw new Error(
                        `Connection "${conn.code}" disappeared during code-first synchronization`,
                    );
                }
            } else {
                await this.connectionService.create(ctx, {
                    code: conn.code,
                    type,
                    config: conn.settings,
                }, {
                    configurationSource: ConfigurationSource.CODE_FIRST,
                });
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
                definition = this.getEffectivePipelineDefinition(pipeline);
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
                const enabled = pipeline.enabled ?? true;
                if (
                    existing.name === pipeline.name
                    && existing.enabled === enabled
                    && definitionsEqual(existing.definition, definition)
                ) {
                    if (
                        existing.configurationSource
                        !== ConfigurationSource.CODE_FIRST
                    ) {
                        await this.pipelineService.claimCodeFirstOwnership(ctx, existing);
                    }
                    if (
                        existing.status === PipelineStatus.PUBLISHED
                        && existing.currentRevisionId != null
                        && collectAdapterUsages(definition).length > 0
                        && validateAdapterBindings(
                            this.registry,
                            existing.definition,
                            true,
                        ).length > 0
                    ) {
                        await this.pipelineService.refreshCodeFirstPublishedDefinition(
                            ctx,
                            existing.id,
                            withResolvedAdapterBindings(this.registry, definition),
                        );
                    }
                    synced++;
                    continue;
                }
                await this.pipelineService.update(ctx, {
                    id: existing.id,
                    name: pipeline.name,
                    definition,
                    enabled,
                }, {
                    configurationSource: ConfigurationSource.CODE_FIRST,
                    allowCodeFirstManaged: true,
                });
            } else {
                await this.pipelineService.create(ctx, {
                    code: pipeline.code,
                    name: pipeline.name,
                    definition,
                    enabled: pipeline.enabled ?? true,
                    version: definition.version,
                }, {
                    configurationSource: ConfigurationSource.CODE_FIRST,
                });
            }
            synced++;
        }

        return { synced, failed };
    }

    private getEffectivePipelineDefinition(
        pipeline: CodeFirstPipeline,
    ): CodeFirstPipeline['definition'] {
        return withEffectivePipelineCapabilities(
            this.registry,
            validateCodeFirstPipeline(pipeline),
        );
    }

}
