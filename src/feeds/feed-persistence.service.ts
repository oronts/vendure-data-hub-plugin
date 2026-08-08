import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { isDeepStrictEqual } from 'node:util';
import { LOGGER_CONTEXTS } from '../constants';
import { DataHubFeed } from '../entities/config';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';
import { FileStorageService } from '../services/storage/file-storage.service';
import { getErrorMessage, isDuplicateEntryError } from '../utils/error.utils';
import { FeedConfigValidationError } from './feed-config.validation';
import type {
    FeedConfig,
    GeneratedFeed,
    GeneratedFeedArtifact,
    RegisteredFeedConfig,
} from './generators/feed-types';

@Injectable()
export class FeedPersistenceService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private fileStorage: FileStorageService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FEED_PERSISTENCE);
    }

    async create(ctx: RequestContext, config: FeedConfig): Promise<RegisteredFeedConfig> {
        const { channelId, channelToken } = this.getChannelIdentity(ctx);
        this.assertChannelToken(config, channelToken);

        const repository = this.connection.getRepository(ctx, DataHubFeed);
        const existing = await repository.findOne({ where: { channelId, code: config.code } });
        if (existing) this.throwDuplicateCode(config.code);

        const entity = new DataHubFeed();
        this.applyConfig(entity, config, channelId, channelToken);

        let saved: DataHubFeed;
        try {
            saved = await repository.save(entity);
        } catch (error) {
            if (isDuplicateEntryError(getErrorMessage(error))) {
                this.throwDuplicateCode(config.code);
            }
            throw error;
        }
        this.logger.info('Created feed configuration', {
            feedCode: config.code,
            format: config.format,
            channelId,
        });
        return this.toConfig(saved);
    }

    async update(
        ctx: RequestContext,
        id: ID,
        config: FeedConfig,
    ): Promise<RegisteredFeedConfig | undefined> {
        const { channelId, channelToken } = this.getChannelIdentity(ctx);
        this.assertChannelToken(config, channelToken);
        const repository = this.connection.getRepository(ctx, DataHubFeed);
        const entity = await repository.findOne({ where: { id, channelId } });
        if (!entity) return undefined;
        if (!this.hasDefinitionChanged(entity, config, channelToken)) {
            return this.toConfig(entity);
        }

        const previousArtifactFileId = entity.artifactFileId;
        const scheduleChanged = this.hasScheduleChanged(entity, config);
        this.applyConfig(entity, config, channelId, channelToken);
        this.clearArtifactMetadata(entity);
        if (scheduleChanged) entity.lastScheduledAt = null;

        let saved: DataHubFeed;
        try {
            saved = await repository.save(entity);
        } catch (error) {
            if (isDuplicateEntryError(getErrorMessage(error))) {
                this.throwDuplicateCode(config.code);
            }
            throw error;
        }
        if (previousArtifactFileId) await this.deleteArtifact(ctx, previousArtifactFileId);
        this.logger.info('Updated feed configuration', {
            feedId: String(id),
            feedCode: config.code,
            format: config.format,
            channelId,
        });
        return this.toConfig(saved);
    }

    async delete(ctx: RequestContext, id: ID): Promise<boolean> {
        const entity = await this.getEntityById(ctx, id);
        if (!entity) return false;
        await this.connection.getRepository(ctx, DataHubFeed).remove(entity);
        if (entity.artifactFileId) await this.deleteArtifact(ctx, entity.artifactFileId);
        this.logger.info('Deleted feed configuration', {
            feedId: String(id),
            feedCode: entity.code,
            channelId: entity.channelId,
        });
        return true;
    }

    async get(ctx: RequestContext, feedCode: string): Promise<RegisteredFeedConfig | undefined> {
        const entity = await this.getEntity(ctx, feedCode);
        return entity ? this.toConfig(entity) : undefined;
    }

    async getById(ctx: RequestContext, id: ID): Promise<RegisteredFeedConfig | undefined> {
        const entity = await this.getEntityById(ctx, id);
        return entity ? this.toConfig(entity) : undefined;
    }

    async list(ctx: RequestContext): Promise<RegisteredFeedConfig[]> {
        const { channelId } = this.getChannelIdentity(ctx);
        const entities = await this.connection.getRepository(ctx, DataHubFeed).find({
            where: { channelId },
            order: { code: 'ASC' },
        });
        return entities.map(entity => this.toConfig(entity));
    }

    async getEntity(ctx: RequestContext, feedCode: string): Promise<DataHubFeed | null> {
        const { channelId } = this.getChannelIdentity(ctx);
        return this.connection.getRepository(ctx, DataHubFeed).findOne({
            where: { channelId, code: feedCode },
        });
    }

    async getEntityById(ctx: RequestContext, id: ID): Promise<DataHubFeed | null> {
        const { channelId } = this.getChannelIdentity(ctx);
        return this.connection.getRepository(ctx, DataHubFeed).findOne({
            where: { id, channelId },
        });
    }

    async storeArtifact(
        ctx: RequestContext,
        entity: DataHubFeed,
        generated: GeneratedFeed,
    ): Promise<GeneratedFeedArtifact> {
        const content = Buffer.isBuffer(generated.content)
            ? generated.content
            : Buffer.from(generated.content, 'utf-8');
        const stored = await this.fileStorage.storeFile(
            ctx,
            content,
            generated.filename,
            generated.contentType,
            {
                metadata: {
                    source: 'data-hub-feed',
                    feedCode: entity.code,
                    feedId: String(entity.id),
                    generatedAt: generated.generatedAt.toISOString(),
                    itemCount: generated.itemCount,
                },
            },
        );
        if (!stored.success || !stored.file) {
            throw new Error(stored.error ?? 'Failed to store generated feed artifact');
        }

        const previousArtifactFileId = entity.artifactFileId;
        entity.artifactFileId = stored.file.id;
        entity.artifactGeneratedAt = generated.generatedAt;
        entity.artifactItemCount = generated.itemCount;
        entity.artifactFilename = generated.filename;
        entity.artifactContentType = generated.contentType;
        try {
            await this.connection.getRepository(ctx, DataHubFeed).save(entity);
        } catch (error) {
            await this.deleteArtifact(ctx, stored.file.id);
            throw error;
        }
        if (previousArtifactFileId && previousArtifactFileId !== stored.file.id) {
            await this.deleteArtifact(ctx, previousArtifactFileId);
        }
        return {
            ...generated,
            fileId: stored.file.id,
            downloadUrl: this.getDownloadUrl(stored.file.id),
        };
    }

    private applyConfig(
        entity: DataHubFeed,
        config: FeedConfig,
        channelId: string,
        channelToken: string,
    ): void {
        entity.channelId = channelId;
        entity.channelToken = channelToken;
        entity.code = config.code;
        entity.name = config.name;
        entity.format = config.format;
        entity.customGeneratorCode = config.customGeneratorCode ?? null;
        entity.filters = config.filters ?? null;
        entity.fieldMappings = config.fieldMappings ?? null;
        entity.options = config.options ?? null;
        entity.scheduleEnabled = config.schedule?.enabled ?? false;
        entity.scheduleCron = config.schedule?.enabled ? config.schedule.cron : null;
        entity.scheduleTimezone = config.schedule?.enabled
            ? config.schedule.timezone ?? null
            : null;
    }

    private hasDefinitionChanged(
        entity: DataHubFeed,
        config: FeedConfig,
        channelToken: string,
    ): boolean {
        return entity.channelToken !== channelToken ||
            entity.code !== config.code ||
            entity.name !== config.name ||
            entity.format !== config.format ||
            entity.customGeneratorCode !== (config.customGeneratorCode ?? null) ||
            !isDeepStrictEqual(entity.filters, config.filters ?? null) ||
            !isDeepStrictEqual(entity.fieldMappings, config.fieldMappings ?? null) ||
            !isDeepStrictEqual(entity.options, config.options ?? null) ||
            this.hasScheduleChanged(entity, config);
    }

    private hasScheduleChanged(entity: DataHubFeed, config: FeedConfig): boolean {
        return entity.scheduleEnabled !== (config.schedule?.enabled ?? false) ||
            entity.scheduleCron !== (config.schedule?.enabled ? config.schedule.cron : null) ||
            entity.scheduleTimezone !== (
                config.schedule?.enabled ? config.schedule.timezone ?? null : null
            );
    }

    private assertChannelToken(config: FeedConfig, channelToken: string): void {
        if (!config.channelToken || config.channelToken === channelToken) return;
        throw new FeedConfigValidationError(
            'Feed channelToken must match the active request channel',
            'channelToken',
            config.channelToken,
        );
    }

    private throwDuplicateCode(code: string): never {
        throw new FeedConfigValidationError(
            `Feed code "${code}" already exists in this channel`,
            'code',
            code,
        );
    }

    private toConfig(entity: DataHubFeed): RegisteredFeedConfig {
        return {
            id: entity.id,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
            code: entity.code,
            name: entity.name,
            format: entity.format,
            channelToken: entity.channelToken,
            customGeneratorCode: entity.customGeneratorCode ?? undefined,
            filters: entity.filters ?? undefined,
            fieldMappings: entity.fieldMappings ?? undefined,
            options: entity.options ?? undefined,
            schedule: entity.scheduleCron
                ? {
                    enabled: entity.scheduleEnabled,
                    cron: entity.scheduleCron,
                    timezone: entity.scheduleTimezone ?? undefined,
                }
                : undefined,
            lastGeneratedAt: entity.artifactGeneratedAt ?? undefined,
            lastItemCount: entity.artifactItemCount ?? undefined,
            downloadUrl: entity.artifactFileId
                ? this.getDownloadUrl(entity.artifactFileId)
                : undefined,
        };
    }

    private getChannelIdentity(ctx: RequestContext): {
        channelId: string;
        channelToken: string;
    } {
        const channelId = ctx.channelId?.toString();
        const channelToken = ctx.channel?.token;
        if (!channelId || !channelToken) {
            throw new Error('An active channel is required for feed operations');
        }
        return { channelId, channelToken };
    }

    private getDownloadUrl(fileId: string): string {
        return `/data-hub/files/${fileId}/download`;
    }

    private clearArtifactMetadata(entity: DataHubFeed): void {
        entity.artifactFileId = null;
        entity.artifactGeneratedAt = null;
        entity.artifactItemCount = null;
        entity.artifactFilename = null;
        entity.artifactContentType = null;
    }

    private async deleteArtifact(ctx: RequestContext, fileId: string): Promise<void> {
        try {
            const deleted = await this.fileStorage.deleteFile(ctx, fileId);
            if (!deleted) this.logger.warn('Feed artifact was not found during cleanup', { fileId });
        } catch (error) {
            this.logger.warn('Failed to clean up feed artifact', {
                fileId,
                error: getErrorMessage(error),
            });
        }
    }
}
