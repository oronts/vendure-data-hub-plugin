import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { minimatch } from 'minimatch';
import { PipelineService } from '../pipeline/pipeline.service';
import { ConnectionService } from '../config/connection.service';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { LOGGER_CONTEXTS, SCHEDULER } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { getErrorMessage, toErrorOrUndefined, ensureError } from '../../utils/error.utils';
import { DomainEventsService } from './domain-events.service';
import {
    PipelineDefinition,
    FileWatchTriggerConfig,
    TriggerConfig,
} from '../../types/index';
import { TriggerType as TriggerTypeEnum } from '../../constants/enums';
import { PipelineStatus } from '../../constants';
import { Pipeline } from '../../entities/pipeline';

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
 * - Tracks processed files using checkpoints
 * - Triggers pipeline runs for newly detected files
 * - Uses distributed locks to prevent duplicate processing
 *
 * File Detection Logic:
 * - Lists files from connection (FTP/S3/SFTP)
 * - Filters by glob pattern
 * - Compares against last checkpoint (lastProcessedTimestamp)
 * - Processes files modified after checkpoint
 * - Updates checkpoint after successful processing
 */

/** Maximum number of concurrent watchers to prevent unbounded growth */
const MAX_WATCHERS = 500;

/** Default polling interval if not specified (5 minutes) */
const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** Minimum allowed polling interval (30 seconds) */
const MIN_POLL_INTERVAL_MS = 30 * 1000;

/** Default minimum file age before processing (30 seconds) */
const DEFAULT_MIN_FILE_AGE_MS = 30 * 1000;

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
    debounceMs?: number;
}

/**
 * Active file watcher instance
 */
interface ActiveWatcher {
    config: FileWatcherConfig;
    timer: NodeJS.Timeout;
    lastCheckpoint: Date | null;
    isProcessing: boolean;
    lockKey: string;
}

/**
 * Discovered file metadata
 */
interface DiscoveredFile {
    path: string;
    name: string;
    modifiedAt: Date;
    size: number;
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
                where: { status: PipelineStatus.PUBLISHED },
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
            debounceMs: config.debounceMs,
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

        // Initial poll
        await this.pollForFiles(config, null, lockKey);

        // Start periodic polling
        const timer = setInterval(() => {
            if (this.isDestroying) return;

            const watcher = this.watchers.get(key);
            if (!watcher || watcher.isProcessing) return;

            this.pollForFiles(config, watcher.lastCheckpoint, lockKey).catch(err => {
                this.logger.error(`Poll error for ${key}`, ensureError(err));
            });
        }, config.pollIntervalMs);

        if (typeof timer.unref === 'function') {
            timer.unref();
        }

        this.watchers.set(key, {
            config,
            timer,
            lastCheckpoint: null,
            isProcessing: false,
            lockKey,
        });

        this.logger.info(`Started file watcher for ${key}`, {
            path: config.path,
            pattern: config.pattern,
            pollIntervalMs: config.pollIntervalMs,
        });
    }

    /**
     * Poll for new files
     */
    private async pollForFiles(
        config: FileWatcherConfig,
        lastCheckpoint: Date | null,
        lockKey: string,
    ): Promise<void> {
        const key = this.getWatcherKey(config.pipelineCode, config.triggerKey);
        const watcher = this.watchers.get(key);
        if (!watcher) return;

        // Acquire distributed lock if available
        const lock = await this.acquireLock(lockKey);
        if (!lock) {
            this.logger.debug(`Could not acquire lock for ${key}, skipping poll`);
            return;
        }

        try {
            watcher.isProcessing = true;

            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            const files = await this.listFiles(ctx, config);

            // Filter files by timestamp and age
            const now = new Date();
            const checkpoint = lastCheckpoint || new Date(0);
            const newFiles = files.filter(file => {
                const isNewer = file.modifiedAt > checkpoint;
                const isOldEnough = (now.getTime() - file.modifiedAt.getTime()) >= config.minFileAge;
                return isNewer && isOldEnough;
            });

            if (newFiles.length === 0) {
                this.logger.debug(`No new files for ${key}`);
                return;
            }

            this.logger.info(`Found ${newFiles.length} new files for ${key}`);

            // Process each file
            for (const file of newFiles) {
                await this.processFile(ctx, config, file);
            }

            // Update checkpoint to latest file
            const latestFile = newFiles.reduce((latest, file) =>
                file.modifiedAt > latest.modifiedAt ? file : latest
            , newFiles[0]);

            watcher.lastCheckpoint = latestFile.modifiedAt;

        } catch (error) {
            this.logger.error(`Failed to poll files for ${key}`, ensureError(error));
        } finally {
            watcher.isProcessing = false;
            await this.releaseLock(lockKey, lock);
        }
    }

    /**
     * List files from connection
     */
    private async listFiles(
        ctx: RequestContext,
        config: FileWatcherConfig,
    ): Promise<DiscoveredFile[]> {
        const connection = await this.connectionService.getByCode(ctx, config.connectionCode);
        if (!connection) {
            throw new Error(`Connection not found: ${config.connectionCode}`);
        }

        const files: DiscoveredFile[] = [];

        // Handle different connection types
        const connectionType = connection.type.toUpperCase();
        if (connectionType === 'FTP' || connectionType === 'SFTP') {
            const ftpFiles = await this.listFtpFiles(connection, config);
            files.push(...ftpFiles);
        } else if (connectionType === 'S3') {
            const s3Files = await this.listS3Files(connection, config);
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
    private async listFtpFiles(connection: any, config: FileWatcherConfig): Promise<DiscoveredFile[]> {
        // Basic-sftp for SFTP
        if (connection.config.protocol === 'sftp' || !connection.config.protocol) {
            try {
                const Client = (await import('ssh2-sftp-client')).default;
                const sftp = new Client();

                await sftp.connect({
                    host: connection.config.host,
                    port: connection.config.port || 22,
                    username: connection.config.username,
                    password: connection.config.password,
                    privateKey: connection.config.privateKey,
                });

                try {
                    const fileList: any[] = await sftp.list(config.path);
                    return fileList
                        .filter((f: any) => f.type === '-') // Regular files only
                        .map((f: any) => ({
                            path: `${config.path}/${f.name}`.replace(/\/+/g, '/'),
                            name: f.name,
                            modifiedAt: new Date(f.modifyTime),
                            size: f.size,
                        }));
                } finally {
                    await sftp.end();
                }
            } catch (error) {
                this.logger.error('SFTP list failed', ensureError(error));
                return [];
            }
        }

        // For FTP, would need basic-ftp or similar
        throw new Error('FTP protocol not yet supported in file watch (use SFTP)');
    }

    /**
     * List files from S3
     */
    private async listS3Files(connection: any, config: FileWatcherConfig): Promise<DiscoveredFile[]> {
        try {
            const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');

            const client = new S3Client({
                region: connection.config.region,
                credentials: {
                    accessKeyId: connection.config.accessKeyId,
                    secretAccessKey: connection.config.secretAccessKey,
                },
                endpoint: connection.config.endpoint,
            });

            const command = new ListObjectsV2Command({
                Bucket: connection.config.bucket,
                Prefix: config.path,
            });

            const response = await client.send(command);
            const objects = response.Contents || [];

            return objects
                .filter((obj: any) => obj.Key && !obj.Key.endsWith('/')) // Exclude folders
                .map((obj: any) => ({
                    path: obj.Key,
                    name: obj.Key.split('/').pop() || obj.Key,
                    modifiedAt: obj.LastModified || new Date(),
                    size: obj.Size || 0,
                }));
        } catch (error) {
            this.logger.error('S3 list failed', ensureError(error));
            return [];
        }
    }

    /**
     * Process a discovered file by triggering the pipeline
     */
    private async processFile(
        ctx: RequestContext,
        config: FileWatcherConfig,
        file: DiscoveredFile,
    ): Promise<void> {
        try {
            this.logger.info(`Processing file: ${file.path}`, {
                pipeline: config.pipelineCode,
                file: file.name,
                size: file.size,
            });

            // Trigger pipeline with file metadata
            const seedRecord = {
                path: file.path,
                name: file.name,
                modifiedAt: file.modifiedAt.toISOString(),
                size: file.size,
                connectionCode: config.connectionCode,
            };

            await this.pipelineService.startRunByCode(ctx, config.pipelineCode, {
                seedRecords: [seedRecord],
                skipPermissionCheck: true,
                triggeredBy: `file:${config.triggerKey}`,
            });

            this.logger.info(`Pipeline triggered for file: ${file.path}`, {
                pipeline: config.pipelineCode,
            });

        } catch (error) {
            this.logger.error(`Failed to process file: ${file.path}`, ensureError(error), {
                pipeline: config.pipelineCode,
                file: file.name,
            });
        }
    }

    /**
     * Stop a file watcher
     */
    private async stopWatcher(key: string): Promise<void> {
        const watcher = this.watchers.get(key);
        if (!watcher) return;

        clearInterval(watcher.timer);
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
            const result = await this.distributedLock.acquire(key, { ttlMs: 60000 }); // 60 sec TTL
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
