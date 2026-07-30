import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { PipelineService } from '../pipeline/pipeline.service';
import { CheckpointService } from '../data/checkpoint.service';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { LOGGER_CONTEXTS, SCHEDULER, DISTRIBUTED_LOCK } from '../../constants/index';
import { FILE_WATCH } from '../../constants/defaults';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { getErrorMessage, toErrorOrUndefined, ensureError } from '../../utils/error.utils';
import { DomainEventsService } from './domain-events.service';
import { PipelineDefinition } from '../../types/index';
import { RunStatus } from '../../constants/enums';
import { createRemoteFileSourceRecord } from '../../extractors/shared/remote-file-source';
import {
    createPendingFileRun,
    findNextEligibleFile,
    isTerminalFailureStatus,
    pendingFilePosition,
    readFileWatchCheckpoint,
    writeFileWatchCheckpoint,
    type FileWatchCheckpointState,
    type PendingFileRun,
} from './file-watch-checkpoint';
import {
    buildFileWatcherConfig,
    fileWatcherConfigsEqual,
    findEnabledFileTriggers,
    getFileWatcherKey,
    type FileWatcherConfig,
} from './file-watch-config';
import { FileWatchSourceService } from './file-watch-source.service';
import { ConfigSyncService } from '../../bootstrap/seed-data';
import { loadRunnablePipelineDefinitions } from '../pipeline/active-pipeline-definitions';

interface ActiveWatcher {
    config: FileWatcherConfig;
    timer: NodeJS.Timeout;
    statusTimer?: NodeJS.Timeout;
    state: FileWatchCheckpointState;
    isProcessing: boolean;
    lockKey: string;
}

@Injectable()
export class FileWatchService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly watchers = new Map<string, ActiveWatcher>();
    private isDestroying = false;
    private refreshTimer?: NodeJS.Timeout;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private pipelineService: PipelineService,
        private sourceService: FileWatchSourceService,
        private checkpointService: CheckpointService,
        private configSync: ConfigSyncService,
        loggerFactory: DataHubLoggerFactory,
        private domainEvents: DomainEventsService,
        @Optional() private distributedLock?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FILE_WATCH ?? 'DataHub:FileWatch');
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.configSync.ensureSynchronized();
        this.logger.info('File watch service initializing');
        try {
            await this.discoverAndStartWatchers();
        } catch (error) {
            this.logger.warn('Failed to initialize file watchers on startup, will retry on refresh', {
                error: getErrorMessage(error),
            });
        }
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

    private async discoverActiveConfigs(): Promise<Map<string, FileWatcherConfig>> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const configMap = new Map<string, FileWatcherConfig>();

        try {
            const pipelines = await loadRunnablePipelineDefinitions(
                this.connection,
                ctx,
                FILE_WATCH.MAX_WATCHERS,
            );

            for (const pipeline of pipelines) {
                const definition = pipeline.definition as PipelineDefinition;
                if (!definition?.steps) continue;

                const fileTriggers = findEnabledFileTriggers(definition);
                for (const { triggerKey, config } of fileTriggers) {
                    const watcherConfig = buildFileWatcherConfig(
                        String(pipeline.id),
                        pipeline.code,
                        String(pipeline.revisionId),
                        triggerKey,
                        config,
                        message => this.logger.warn(message),
                    );

                    if (watcherConfig) {
                        const key = getFileWatcherKey(
                            pipeline.code,
                            triggerKey,
                        );
                        configMap.set(key, watcherConfig);
                    }
                }
            }
        } catch (error) {
            this.logger.error('Failed to discover file watch configurations', ensureError(error));
            throw error;
        }

        return configMap;
    }

    private async startWatcher(config: FileWatcherConfig): Promise<void> {
        const key = getFileWatcherKey(config.pipelineCode, config.triggerKey);

        if (this.watchers.has(key)) {
            this.logger.debug(`Watcher already exists for ${key}`);
            return;
        }

        if (this.watchers.size >= FILE_WATCH.MAX_WATCHERS) {
            this.logger.warn(`Maximum watchers (${FILE_WATCH.MAX_WATCHERS}) reached, skipping ${key}`);
            return;
        }

        const lockKey = `file-watch:${config.pipelineCode}`;

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

    private async pollForFiles(config: FileWatcherConfig, lockKey: string): Promise<void> {
        const key = getFileWatcherKey(config.pipelineCode, config.triggerKey);
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
                await this.sourceService.listFiles(
                    ctx,
                    config,
                    async () => this.isDestroying,
                ),
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
                pending: createPendingFileRun(
                    nextFile,
                    config.revisionId,
                    config.connectionCode,
                ),
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
        const key = getFileWatcherKey(config.pipelineCode, config.triggerKey);
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
        await this.checkpointService.updateForPipeline(
            ctx,
            config.pipelineId,
            current => writeFileWatchCheckpoint(current, config.triggerKey, state),
        );

        const key = getFileWatcherKey(config.pipelineCode, config.triggerKey);
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
        }, FILE_WATCH.RUN_STATUS_POLL_INTERVAL_MS);

        if (typeof watcher.statusTimer.unref === 'function') {
            watcher.statusTimer.unref();
        }
    }

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
            connectionCode: pending.connectionCode,
        });
        const runIdentity = JSON.stringify({
            pipelineId: config.pipelineId,
            triggerKey: config.triggerKey,
            revisionId: pending.revisionId,
            connectionCode: pending.connectionCode,
            file,
            attempt: pending.attempt,
        });
        const result = await this.pipelineService.startPinnedIdempotentRunWithSeed(
            ctx,
            config.pipelineId,
            pending.revisionId,
            [seedRecord],
            {
                idempotencyKey: runIdentity,
                idempotencyTtlSeconds: FILE_WATCH.RUN_IDEMPOTENCY_TTL_SEC,
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

    private async stopAllWatchers(): Promise<void> {
        for (const key of Array.from(this.watchers.keys())) {
            await this.stopWatcher(key);
        }
    }

    private async refreshWatchers(): Promise<void> {
        if (this.isDestroying) return;

        const activeConfigs = await this.discoverActiveConfigs();
        for (const key of Array.from(this.watchers.keys())) {
            if (!activeConfigs.has(key)) {
                await this.stopWatcher(key);
            }
        }
        for (const [key, config] of activeConfigs) {
            const watcher = this.watchers.get(key);
            if (!watcher) {
                await this.startWatcher(config);
            } else if (!fileWatcherConfigsEqual(watcher.config, config)) {
                await this.stopWatcher(key);
                await this.startWatcher(config);
            }
        }
    }

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

    private async releaseLock(lockKey: string, lock: { token: string } | null): Promise<void> {
        if (!lock || !this.distributedLock || lock.token === 'no-lock') return;

        try {
            await this.distributedLock.release(lockKey, lock.token);
        } catch (error) {
            this.logger.warn(`Failed to release lock: ${lockKey}`, { error: getErrorMessage(error) });
        }
    }
}
