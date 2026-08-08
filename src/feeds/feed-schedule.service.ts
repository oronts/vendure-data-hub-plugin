import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { DISTRIBUTED_LOCK, LOGGER_CONTEXTS, SCHEDULER } from '../constants';
import { DataHubFeed } from '../entities/config';
import { cronMatches } from '../jobs/processors/cron-processor';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';
import { DistributedLockService } from '../services/runtime/distributed-lock.service';
import { RuntimeConfigService } from '../services/runtime/runtime-config.service';
import { getErrorMessage, toErrorOrUndefined } from '../utils/error.utils';
import { SingleFlightTask } from '../utils/async-operation-tracker';
import { FeedGeneratorService } from './feed-generator.service';

function minuteStart(value: Date): Date {
    const minute = new Date(value);
    minute.setSeconds(0, 0);
    return minute;
}

function isSameMinute(left: Date | null, right: Date): boolean {
    return left !== null && minuteStart(left).getTime() === minuteStart(right).getTime();
}

@Injectable()
export class FeedScheduleService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly checkIntervalMs: number;
    private checkHandle: ReturnType<typeof setInterval> | null = null;
    private readonly processingTask = new SingleFlightTask<number>();
    private destroying = false;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private feedGenerator: FeedGeneratorService,
        private distributedLock: DistributedLockService,
        runtimeConfig: RuntimeConfigService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FEED_SCHEDULER);
        this.checkIntervalMs = runtimeConfig.getSchedulerConfig().checkIntervalMs;
    }

    onApplicationBootstrap(): void {
        void this.processDueFeeds().catch(error => {
            this.logger.error('Initial feed schedule check failed', toErrorOrUndefined(error));
        });
        this.checkHandle = setInterval(() => {
            void this.processDueFeeds().catch(error => {
                this.logger.error('Feed schedule check failed', toErrorOrUndefined(error));
            });
        }, this.checkIntervalMs);
        this.checkHandle.unref();
    }

    async onModuleDestroy(): Promise<void> {
        this.destroying = true;
        if (this.checkHandle) {
            clearInterval(this.checkHandle);
            this.checkHandle = null;
        }
        await this.processingTask.settle();
    }

    processDueFeeds(now = new Date()): Promise<number> {
        if (this.destroying || this.processingTask.running) return Promise.resolve(0);
        return this.processingTask.run(() => this.generateDueFeeds(now));
    }

    private async generateDueFeeds(now: Date): Promise<number> {
        const adminCtx = await this.requestContextService.create({ apiType: 'admin' });
        const feeds = await this.connection.getRepository(adminCtx, DataHubFeed).find({
            where: { scheduleEnabled: true },
            order: { id: 'ASC' },
            take: SCHEDULER.MAX_PIPELINE_DISCOVERY,
        });
        let generatedCount = 0;
        for (const feed of feeds) {
            if (!feed.scheduleCron || !cronMatches(
                now,
                feed.scheduleCron,
                feed.scheduleTimezone ?? undefined,
            )) {
                continue;
            }
            if (await this.claimAndGenerate(feed, now)) {
                generatedCount++;
            }
        }
        return generatedCount;
    }

    private async claimAndGenerate(feed: DataHubFeed, now: Date): Promise<boolean> {
        const lockKey = `feed-schedule:${feed.id}`;
        const lock = await this.distributedLock.acquire(lockKey, {
            ttlMs: DISTRIBUTED_LOCK.SCHEDULER_LOCK_TTL_MS,
            waitForLock: false,
        });
        if (!lock.acquired || !lock.token) return false;

        try {
            const adminCtx = await this.requestContextService.create({ apiType: 'admin' });
            const repository = this.connection.getRepository(adminCtx, DataHubFeed);
            const current = await repository.findOne({ where: { id: feed.id } });
            if (
                !current ||
                !current.scheduleEnabled ||
                !current.scheduleCron ||
                !cronMatches(now, current.scheduleCron, current.scheduleTimezone ?? undefined) ||
                isSameMinute(current.lastScheduledAt, now)
            ) {
                return false;
            }

            current.lastScheduledAt = minuteStart(now);
            await repository.save(current);

            const channelCtx = await this.requestContextService.create({
                apiType: 'admin',
                channelOrToken: current.channelToken,
            });
            if (String(channelCtx.channelId) !== current.channelId) {
                throw new Error('Feed channel context is unavailable');
            }
            const artifact = await this.feedGenerator.generateFeedArtifact(
                channelCtx,
                current.code,
            );
            this.logger.info('Scheduled feed artifact generated', {
                feedCode: current.code,
                channelId: current.channelId,
                itemCount: artifact.itemCount,
                fileId: artifact.fileId,
            });
            return true;
        } catch (error) {
            this.logger.error('Scheduled feed generation failed', toErrorOrUndefined(error), {
                feedCode: feed.code,
                channelId: feed.channelId,
                errorMessage: getErrorMessage(error),
            });
            return false;
        } finally {
            try {
                await this.distributedLock.release(lockKey, lock.token);
            } catch (error) {
                this.logger.warn('Failed to release feed schedule lock', {
                    lockKey,
                    error: getErrorMessage(error),
                });
            }
        }
    }
}
