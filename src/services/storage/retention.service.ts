import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { DATAHUB_PLUGIN_OPTIONS, DEFAULTS, TIME, LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubPluginOptions } from '../../types/index';
import { PipelineRun } from '../../entities/pipeline';
import { DataHubRecordError } from '../../entities/data';
import { DataHubSettingsService } from '../config/settings.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

@Injectable()
export class DataHubRetentionService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private handle: ReturnType<typeof setInterval> | null = null;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private settings: DataHubSettingsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.RETENTION_SERVICE);
    }

    async onModuleInit(): Promise<void> {
        this.logger.info('Retention service initialized', {
            purgeIntervalMs: DEFAULTS.RETENTION_PURGE_INTERVAL_MS,
        });

        // Run daily
        this.handle = setInterval(() => this.purge().catch(err => {
            this.logger.error('Scheduled retention purge failed', err instanceof Error ? err : new Error(String(err)));
        }), DEFAULTS.RETENTION_PURGE_INTERVAL_MS);

        // Also run once at startup
        this.logger.debug('Running initial retention purge on startup');
        await this.purge().catch(err => {
            this.logger.warn('Initial retention purge failed', {
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }

    async onModuleDestroy(): Promise<void> {
        if (this.handle) {
            clearInterval(this.handle);
            this.handle = null;
            this.logger.debug('Retention service interval cleared');
        }
    }

    private async purge(): Promise<void> {
        const startTime = Date.now();
        const db = await this.settings.get();
        const daysRuns = Number((db.retentionDaysRuns ?? this.options.retentionDaysRuns) ?? 0);
        const daysErrors = Number((db.retentionDaysErrors ?? this.options.retentionDaysErrors) ?? DEFAULTS.RETENTION_DAYS_RUNS);
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const now = new Date();

        let runsDeleted = 0;
        let errorsDeleted = 0;

        if (daysRuns > 0) {
            const cutoff = new Date(now.getTime() - daysRuns * TIME.DAY);
            this.logger.debug('Purging old pipeline runs', {
                retentionDays: daysRuns,
                cutoffDate: cutoff.toISOString(),
            });
            const result = await this.connection.getRepository(ctx, PipelineRun).createQueryBuilder().delete()
                .where('finishedAt IS NOT NULL AND finishedAt < :cutoff', { cutoff: cutoff.toISOString() })
                .execute();
            runsDeleted = result.affected ?? 0;
        }

        if (daysErrors > 0) {
            const cutoff = new Date(now.getTime() - daysErrors * TIME.DAY);
            this.logger.debug('Purging old record errors', {
                retentionDays: daysErrors,
                cutoffDate: cutoff.toISOString(),
            });
            const result = await this.connection.getRepository(ctx, DataHubRecordError).createQueryBuilder().delete()
                .where('createdAt < :cutoff', { cutoff: cutoff.toISOString() })
                .execute();
            errorsDeleted = result.affected ?? 0;
        }

        const durationMs = Date.now() - startTime;

        if (runsDeleted > 0 || errorsDeleted > 0) {
            this.logger.info('Retention purge completed', {
                runsDeleted,
                errorsDeleted,
                durationMs,
            });
        } else {
            this.logger.debug('Retention purge completed - no records to delete', { durationMs });
        }
    }
}
