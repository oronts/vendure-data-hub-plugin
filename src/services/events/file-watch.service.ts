import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { minimatch } from 'minimatch';
import { PipelineService } from '../pipeline/pipeline.service';
import { ConnectionService, type RuntimeDataHubConnection } from '../config/connection.service';
import { SecretService } from '../config/secret.service';
import { CheckpointService } from '../data/checkpoint.service';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { LOGGER_CONTEXTS, SCHEDULER, DISTRIBUTED_LOCK } from '../../constants/index';
import { FILE_WATCH } from '../../constants/defaults';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { getErrorMessage, toErrorOrUndefined, ensureError } from '../../utils/error.utils';
import { DomainEventsService } from './domain-events.service';
import {
    PipelineDefinition,
    FileWatchTriggerConfig,
    TriggerConfig,
    JsonObject,
    ExtractorContext,
} from '../../types/index';
import { RunStatus, TriggerType as TriggerTypeEnum } from '../../constants/enums';
import { PipelineStatus } from '../../constants';
import { Pipeline } from '../../entities/pipeline';
import { createRemoteFileSourceRecord } from '../../extractors/shared/remote-file-source';
import { createClient as createFtpClient } from '../../extractors/ftp/connection';
import type { FtpExtractorConfig } from '../../extractors/ftp/types';
import { createS3Client } from '../../extractors/s3/client';
import type { S3ExtractorConfig } from '../../extractors/s3/types';
import {
    createConnectionsAdapter,
    createLoggerAdapter,
    createSecretsAdapter,
} from '../../runtime/executors/context-adapters';
import {
    createPendingFileRun,
    findNextEligibleFile,
    isTerminalFailureStatus,
    pendingFilePosition,
    readFileWatchCheckpoint,
    writeFileWatchCheckpoint,
    type DiscoveredFile,
    type FileWatchCheckpointState,
    type PendingFileRun,
} from './file-watch-checkpoint';
import {
    discoverFtpFiles,
    normalizeS3WatchPrefix,
    shouldIncludeS3Object,
} from './remote-file-discovery';

/**
 * File Watch Service
 *
 * Monitors remote file systems (FTP, SFTP, S3) for new files and automatically
 * triggers pipelines when files matching glob patterns are detected.
 *
 * Architecture:
 * - Discovers pipelines with FILE triggers on startup
 * - Starts watchers based on autoStart configuration
 * - Polls remote paths at configured intervals
 * - Tracks processed files using persistent checkpoints (via CheckpointService)
 * - Triggers pipeline runs for newly detected files
 * - Uses distributed locks to prevent duplicate processing
 *
 * File Detection Logic:
 * - Lists files from connection (FTP/S3/SFTP)
 * - Filters by glob pattern
 * - Compares against a stable timestamp/path checkpoint persisted in the database
 * - Advances the checkpoint only after the corresponding run reaches COMPLETED
 * - Keeps a durable pending run so restarts can reconcile terminal status
 * - On restart, resumes the pending run or the next ordered file
 */

const MAX_WATCHERS = FILE_WATCH.MAX_WATCHERS;
const DEFAULT_POLL_INTERVAL_MS = FILE_WATCH.DEFAULT_POLL_INTERVAL_MS;
const MIN_POLL_INTERVAL_MS = FILE_WATCH.MIN_POLL_INTERVAL_MS;
const DEFAULT_MIN_FILE_AGE_MS = FILE_WATCH.DEFAULT_MIN_FILE_AGE_MS;
const RUN_STATUS_POLL_INTERVAL_MS = FILE_WATCH.RUN_STATUS_POLL_INTERVAL_MS;
const RUN_IDEMPOTENCY_TTL_SEC = FILE_WATCH.RUN_IDEMPOTENCY_TTL_SEC;

/**
 * Configuration for a file watcher instance
 */
interface FileWatcherConfig {
    pipelineId: string;
    pipelineCode: string;
    triggerKey: string;
    connectionCode: string;
    path: string;
    pattern?: string;
    pollIntervalMs: number;
    minFileAge: number;
    recursive: boolean;
    autoStart: boolean;
}

/**
 * Active file watcher instance
 */
interface ActiveWatcher {
    config: FileWatcherConfig;
    timer: NodeJS.Timeout;
    statusTimer?: NodeJS.Timeout;
    state: FileWatchCheckpointState;
    isProcessing: boolean;
    lockKey: string;
}

@Injectable()
export class FileWatchService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly watchers = new Map<string, ActiveWatcher>();
    private isDestroying = false;
    private refreshTimer?: NodeJS.Timeout;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private connectionService: ConnectionService,
        private secretService: SecretService,
        private checkpointService: CheckpointService,
        loggerFactory: DataHubLoggerFactory,
        private domainEvents: DomainEventsService,
        @Optional() private distributedLock?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FILE_WATCH ?? 'DataHub:FileWatch');
    }

    async onModuleInit(): Promise<void> {
        this.logger.info('File watch service initializing');

        // Discover and start watchers
        try {
            await this.discoverAndStartWatchers();
        } catch (error) {
            this.logger.warn('Failed to initialize file watchers on startup, will retry on refresh', {
                error: getErrorMessage(error),
            });
        }

        // Periodic refresh to discover new/changed pipelines
        this.refreshTimer = setInterval(() => {
            this.refreshWatchers().catch(err => {
                this.logger.error('Failed to refresh file watchers', ensureError(err));
            });
        }, SCHEDULER.REFRESH_INTERVAL_MS);

        if (typeof this.refreshTimer.unref === 'function') {
            this.refreshTimer.unref();
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.isDestroying = true;

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }

        await this.stopAllWatchers();
        this.logger.info('File watch service cleanup complete');
    }

    /**
     * Discover pipelines with FILE triggers and start watchers
     */
    private async discoverAndStartWatchers(): Promise<void> {
        const activeConfigs = await this.discoverActiveConfigs();
        let startedCount = 0;

        for (const [, config] of activeConfigs) {
            try {
                await this.startWatcher(config);
                startedCount++;
            } catch (error) {
                this.logger.error(`Failed to start watcher for pipeline ${config.pipelineCode}`,
                    toErrorOrUndefined(error), {
                        pipelineCode: config.pipelineCode,
                        triggerKey: config.triggerKey,
                    });
            }
        }

        if (startedCount > 0) {
            this.logger.info(`Started ${startedCount} file watchers`);
        }
    }

    /**
     * Discover all published pipelines with FILE triggers
     */
    private async discoverActiveConfigs(): Promise<Map<string, FileWatcherConfig>> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const configMap = new Map<string, FileWatcherConfig>();

        try {
            const repo = this.connection.getRepository(ctx, Pipeline);
            const pipelines = await repo.find({
                where: { status: PipelineStatus.PUBLISHED, enabled: true },
                select: ['id', 'code', 'definition'],
            });

            for (const pipeline of pipelines) {
                const definition = pipeline.definition as PipelineDefinition;
                if (!definition?.steps) continue;

                const fileTriggers = this.findEnabledFileTriggers(definition);
                for (const { triggerKey, config } of fileTriggers) {
                    const watcherConfig = this.buildWatcherConfig(
                        String(pipeline.id),
                        pipeline.code,
                        triggerKey,
                        config,
                    );

                    if (watcherConfig) {
                        const key = this.getWatcherKey(pipeline.code, triggerKey);
                        configMap.set(key, watcherConfig);
                    }
                }
            }
        } catch (error) {
            this.logger.error('Failed to discover file watch configurations', ensureError(error));
        }

        return configMap;
    }

    /**
     * Find all enabled FILE triggers in a pipeline definition
     */
    private findEnabledFileTriggers(definition: PipelineDefinition): Array<{
        triggerKey: string;
        config: FileWatchTriggerConfig;
    }> {
        const triggers: Array<{ triggerKey: string; config: FileWatchTriggerConfig }> = [];

        for (const step of definition.steps) {
            if (step.type !== 'TRIGGER') continue;

            const triggerConfig = step.config as unknown as TriggerConfig | undefined;
            if (!triggerConfig) continue;

            const isEnabled = triggerConfig.enabled !== false;
            const isFileType = triggerConfig.type === TriggerTypeEnum.FILE;
            const fileWatchConfig = triggerConfig.fileWatch;

            if (isEnabled && isFileType && fileWatchConfig) {
                triggers.push({
                    triggerKey: step.key,
                    config: fileWatchConfig,
                });
            }
        }

        return triggers;
    }

    /**
     * Build watcher configuration from trigger config
     */
    private buildWatcherConfig(
        pipelineId: string,
        pipelineCode: string,
        triggerKey: string,
        config: FileWatchTriggerConfig,
    ): FileWatcherConfig | null {
        if (!config.path) {
            this.logger.warn(`FILE trigger missing path for pipeline ${pipelineCode}`);
            return null;
        }

        if (!config.connectionCode) {
            this.logger.warn(`FILE trigger missing connectionCode for pipeline ${pipelineCode}`);
            return null;
        }

        const pollIntervalMs = Math.max(
            config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
            MIN_POLL_INTERVAL_MS,
        );

        const minFileAge = config.minFileAge
            ? config.minFileAge * 1000
            : DEFAULT_MIN_FILE_AGE_MS;

        return {
            pipelineId,
            pipelineCode,
            triggerKey,
            connectionCode: config.connectionCode,
            path: config.path,
            pattern: config.pattern,
            pollIntervalMs,
            minFileAge,
            recursive: config.recursive ?? true,
            autoStart: true, // Always auto-start for published pipelines
        };
    }

    /**
     * Start a file watcher
     */
    private async startWatcher(config: FileWatcherConfig): Promise<void> {
        const key = this.getWatcherKey(config.pipelineCode, config.triggerKey);

        if (this.watchers.has(key)) {
            this.logger.debug(`Watcher already exists for ${key}`);
            return;
        }

        if (this.watchers.size >= MAX_WATCHERS) {
            this.logger.warn(`Maximum watchers (${MAX_WATCHERS}) reached, skipping ${key}`);
            return;
        }

        const lockKey = `file-watch:${key}`;

        let savedState: FileWatchCheckpointState = {};
        try {
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            const checkpoint = await this.checkpointService.getByPipeline(ctx, config.pipelineId);
            savedState = readFileWatchCheckpoint(checkpoint?.data, config.triggerKey);
            if (savedState.cursor || savedState.pending) {
                this.logger.debug(`Restored file-watch checkpoint for ${key}`, {
                    cursor: savedState.cursor,
                    pendingRunId: savedState.pending?.runId,
                });
            }
        } catch (error) {
            this.logger.error(`Failed to load file-watch checkpoint for ${key}`, ensureError(error));
            throw error;
        }

        const timer = setInterval(() => {
            if (this.isDestroying) return;

            const watcher = this.watchers.get(key);
            if (!watcher || watcher.isProcessing) return;

            this.pollForFiles(config, lockKey).catch(err => {
                this.logger.error(`Poll error for ${key}`, ensureError(err));
            });
        }, config.pollIntervalMs);

        if (typeof timer.unref === 'function') {
            timer.unref();
        }

        this.watchers.set(key, {
            config,
            timer,
            state: savedState,
            isProcessing: false,
            lockKey,
        });

        await this.pollForFiles(config, lockKey);

        this.logger.info(`Started file watcher for ${key}`, {
            path: config.path,
            pattern: config.pattern,
            pollIntervalMs: config.pollIntervalMs,
        });
    }

    /**
     * Poll for new files and reconcile the previously triggered run.
     */
    private async pollForFiles(config: FileWatcherConfig, lockKey: string): Promise<void> {
        const key = this.getWatcherKey(config.pipelineCode, config.triggerKey);
        const watcher = this.watchers.get(key);
        if (!watcher) return;

        const lock = await this.acquireLock(lockKey);
        if (!lock) {
            this.logger.debug(`Could not acquire lock for ${key}, skipping poll`);
            return;
        }

        try {
            watcher.isProcessing = true;
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            if (!(await this.reconcilePendingRun(ctx, config, watcher))) {
                return;
            }

            const nextFile = findNextEligibleFile(
                await this.listFiles(ctx, config),
                watcher.state.cursor,
                new Date(),
                config.minFileAge,
            );
            if (!nextFile) {
                this.logger.debug(`No new files for ${key}`);
                return;
            }

            const stateWithIntent: FileWatchCheckpointState = {
                ...watcher.state,
                pending: createPendingFileRun(nextFile),
            };
            await this.persistWatcherState(ctx, config, stateWithIntent);
            await this.startPendingRun(ctx, config, watcher);
        } catch (error) {
            this.logger.error(`Failed to poll files for ${key}`, ensureError(error));
        } finally {
            watcher.isProcessing = false;
            await this.releaseLock(lockKey, lock);
        }
    }

    private async reconcilePendingRun(
        ctx: RequestContext,
        config: FileWatcherConfig,
        watcher: ActiveWatcher,
    ): Promise<boolean> {
        const pending = watcher.state.pending;
        if (!pending) return true;
        if (!pending.runId) {
            await this.startPendingRun(ctx, config, watcher);
            return false;
        }

        const run = await this.pipelineService.runById(ctx, pending.runId);
        if (run?.status === RunStatus.COMPLETED) {
            const completedState: FileWatchCheckpointState = {
                cursor: pendingFilePosition(pending),
            };
            await this.persistWatcherState(ctx, config, completedState);
            this.logger.info('File pipeline completed; checkpoint advanced', {
                pipeline: config.pipelineCode,
                file: pending.file.path,
                runId: pending.runId,
            });
            return true;
        }

        if (run && !isTerminalFailureStatus(run.status)) {
            this.scheduleStatusPoll(config, watcher);
            return false;
        }

        const retryState: FileWatchCheckpointState = {
            ...watcher.state,
            pending: {
                ...pending,
                attempt: pending.attempt + 1,
                runId: undefined,
            },
        };
        await this.persistWatcherState(ctx, config, retryState);
        this.logger.warn('File pipeline did not complete successfully; file remains retryable', {
            pipeline: config.pipelineCode,
            file: pending.file.path,
            runId: pending.runId,
            status: run?.status ?? 'MISSING',
            nextAttempt: retryState.pending?.attempt,
        });
        return false;
    }

    private async startPendingRun(
        ctx: RequestContext,
        config: FileWatcherConfig,
        watcher: ActiveWatcher,
    ): Promise<void> {
        const key = this.getWatcherKey(config.pipelineCode, config.triggerKey);
        if (this.isDestroying || this.watchers.get(key) !== watcher) return;
        const pending = watcher.state.pending;
        if (!pending || pending.runId) return;

        const runId = await this.startFileRun(ctx, config, pending);
        await this.persistWatcherState(ctx, config, {
            ...watcher.state,
            pending: {
                ...pending,
                runId,
            },
        });
        this.scheduleStatusPoll(config, watcher);
    }

    private async persistWatcherState(
        ctx: RequestContext,
        config: FileWatcherConfig,
        state: FileWatchCheckpointState,
    ): Promise<void> {
        const existingCheckpoint = await this.checkpointService.getByPipeline(ctx, config.pipelineId);
        const existingData = (existingCheckpoint?.data ?? {}) as JsonObject;
        await this.checkpointService.setForPipeline(
            ctx,
            config.pipelineId,
            writeFileWatchCheckpoint(existingData, config.triggerKey, state),
        );

        const key = this.getWatcherKey(config.pipelineCode, config.triggerKey);
        const watcher = this.watchers.get(key);
        if (watcher) watcher.state = state;
    }

    private scheduleStatusPoll(config: FileWatcherConfig, watcher: ActiveWatcher): void {
        if (this.isDestroying || watcher.statusTimer) return;

        watcher.statusTimer = setTimeout(() => {
            watcher.statusTimer = undefined;
            if (this.isDestroying) return;
            if (watcher.isProcessing) {
                this.scheduleStatusPoll(config, watcher);
                return;
            }
            this.pollForFiles(config, watcher.lockKey).catch(error => {
                this.logger.error(
                    `Run status poll failed for ${config.pipelineCode}:${config.triggerKey}`,
                    ensureError(error),
                );
            });
        }, RUN_STATUS_POLL_INTERVAL_MS);

        if (typeof watcher.statusTimer.unref === 'function') {
            watcher.statusTimer.unref();
        }
    }

    /**
     * List files from connection
     */
    private async listFiles(
        ctx: RequestContext,
        config: FileWatcherConfig,
    ): Promise<DiscoveredFile[]> {
        const connection = await this.connectionService.getRuntimeByCode(ctx, config.connectionCode);
        if (!connection) {
            throw new Error(`Connection not found: ${config.connectionCode}`);
        }

        const files: DiscoveredFile[] = [];

        // Handle different connection types
        const connectionType = connection.type.toUpperCase();
        if (connectionType === 'FTP' || connectionType === 'SFTP') {
            const ftpFiles = await this.listFtpFiles(ctx, connection, config);
            files.push(...ftpFiles);
        } else if (connectionType === 'S3') {
            const s3Files = await this.listS3Files(ctx, connection, config);
            files.push(...s3Files);
        } else {
            throw new Error(`Unsupported connection type for file watch: ${connection.type}`);
        }

        // Apply glob pattern filter
        if (config.pattern) {
            return files.filter(file => minimatch(file.name, config.pattern!));
        }

        return files;
    }

    /**
     * List files from FTP/SFTP
     */
    private async listFtpFiles(
        ctx: RequestContext,
        connection: RuntimeDataHubConnection,
        config: FileWatcherConfig,
    ): Promise<DiscoveredFile[]> {
        const extractorContext = this.createExtractorContext(ctx, config);
        const sourceConfig = {
            ...connection.config,
            connectionCode: connection.code,
            protocol: connection.type === 'SFTP' ? 'sftp' : 'ftp',
            remotePath: config.path,
        } as unknown as FtpExtractorConfig;
        const client = await createFtpClient(extractorContext, sourceConfig);
        try {
            return (await discoverFtpFiles(client, config.path, config.recursive))
                .map(file => ({
                    path: file.path,
                    name: file.name,
                    modifiedAt: file.modifiedAt,
                    size: file.size,
                }));
        } finally {
            await client.close();
        }
    }

    /**
     * List files from S3
     */
    private async listS3Files(
        ctx: RequestContext,
        connection: RuntimeDataHubConnection,
        config: FileWatcherConfig,
    ): Promise<DiscoveredFile[]> {
        const extractorContext = this.createExtractorContext(ctx, config);
        const sourceConfig = {
            ...connection.config,
            connectionCode: connection.code,
            prefix: config.path,
        } as unknown as S3ExtractorConfig;
        const client = await createS3Client(extractorContext, sourceConfig);
        const files: DiscoveredFile[] = [];
        let continuationToken: string | undefined;
        const prefix = normalizeS3WatchPrefix(config.path);

        try {
            do {
                const result = await client.listObjects(prefix, continuationToken);
                for (const object of result.objects) {
                    if (!shouldIncludeS3Object(object.key, prefix, config.recursive)) continue;
                    files.push({
                        path: object.key,
                        name: object.key.split('/').pop() ?? object.key,
                        modifiedAt: object.lastModified,
                        size: object.size,
                    });
                }
                continuationToken = result.continuationToken;
            } while (continuationToken !== undefined);
            return files;
        } finally {
            await client.close();
        }
    }

    private createExtractorContext(
        ctx: RequestContext,
        config: FileWatcherConfig,
    ): ExtractorContext {
        return {
            ctx,
            pipelineId: config.pipelineId,
            runId: 'file-watch-discovery',
            stepKey: config.triggerKey,
            checkpoint: { data: {} },
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(this.connectionService, ctx) as ExtractorContext['connections'],
            logger: createLoggerAdapter(this.logger),
            dryRun: false,
            setCheckpoint: () => undefined,
            isCancelled: async () => this.isDestroying,
        };
    }

    /**
     * Process a discovered file by triggering the pipeline
     */
    private async startFileRun(
        ctx: RequestContext,
        config: FileWatcherConfig,
        pending: PendingFileRun,
    ): Promise<string> {
        const { file } = pending;
        this.logger.info(`Processing file: ${file.path}`, {
            pipeline: config.pipelineCode,
            file: file.name,
            size: file.size,
            attempt: pending.attempt,
        });

        const seedRecord = createRemoteFileSourceRecord({
            path: file.path,
            name: file.name,
            modifiedAt: file.modifiedAt,
            size: file.size,
            connectionCode: config.connectionCode,
        });
        const runIdentity = JSON.stringify({
            pipelineId: config.pipelineId,
            triggerKey: config.triggerKey,
            connectionCode: config.connectionCode,
            file,
            attempt: pending.attempt,
        });
        const result = await this.pipelineService.startIdempotentRunWithSeed(
            ctx,
            config.pipelineId,
            [seedRecord],
            {
                idempotencyKey: runIdentity,
                idempotencyTtlSeconds: RUN_IDEMPOTENCY_TTL_SEC,
                requestFingerprint: runIdentity,
                triggerKey: config.triggerKey,
                seedMode: 'SOURCE_REFERENCES',
                skipPermissionCheck: true,
                triggeredBy: `file:${config.triggerKey}`,
            },
        );

        this.logger.info(`Pipeline triggered for file: ${file.path}`, {
            pipeline: config.pipelineCode,
            runId: result.run.id,
            duplicate: result.duplicate,
        });
        return String(result.run.id);
    }

    /**
     * Stop a file watcher
     */
    private async stopWatcher(key: string): Promise<void> {
        const watcher = this.watchers.get(key);
        if (!watcher) return;

        clearInterval(watcher.timer);
        if (watcher.statusTimer) {
            clearTimeout(watcher.statusTimer);
        }
        this.watchers.delete(key);

        this.logger.info(`Stopped file watcher: ${key}`);
    }

    /**
     * Stop all watchers
     */
    private async stopAllWatchers(): Promise<void> {
        for (const key of Array.from(this.watchers.keys())) {
            await this.stopWatcher(key);
        }
    }

    /**
     * Refresh watchers - stop removed, start new
     */
    private async refreshWatchers(): Promise<void> {
        if (this.isDestroying) return;

        const activeConfigs = await this.discoverActiveConfigs();

        // Stop watchers for removed/disabled pipelines
        for (const key of Array.from(this.watchers.keys())) {
            if (!activeConfigs.has(key)) {
                await this.stopWatcher(key);
            }
        }

        // Start new watchers
        for (const [key, config] of activeConfigs) {
            if (!this.watchers.has(key)) {
                await this.startWatcher(config);
            }
        }
    }

    /**
     * Acquire distributed lock
     */
    private async acquireLock(key: string): Promise<{ token: string } | null> {
        if (!this.distributedLock) return { token: 'no-lock' }; // No lock service, proceed

        try {
            const result = await this.distributedLock.acquire(key, { ttlMs: DISTRIBUTED_LOCK.FILE_WATCH_LOCK_TTL_MS });
            return result.acquired && result.token ? { token: result.token } : null;
        } catch (error) {
            this.logger.warn(`Failed to acquire lock: ${key}`, { error: getErrorMessage(error) });
            return null;
        }
    }

    /**
     * Release distributed lock
     */
    private async releaseLock(lockKey: string, lock: { token: string } | null): Promise<void> {
        if (!lock || !this.distributedLock || lock.token === 'no-lock') return;

        try {
            await this.distributedLock.release(lockKey, lock.token);
        } catch (error) {
            this.logger.warn(`Failed to release lock: ${lockKey}`, { error: getErrorMessage(error) });
        }
    }

    /**
     * Get unique key for watcher
     */
    private getWatcherKey(pipelineCode: string, triggerKey: string): string {
        return `${pipelineCode}:${triggerKey}`;
    }
}
