import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext, Allow, ID, UserInputError } from '@vendure/core';
import { DeletionResponse, DeletionResult } from '@vendure/common/lib/generated-types';
import {
    FeedGeneratorService,
    FeedConfig,
    RegisteredFeedConfig,
} from '../../feeds/feed-generator.service';
import { ManageDataHubFeedsPermission } from '../../permissions';
import { PAGINATION, FEED_FORMATS, LOGGER_CONTEXTS } from '../../constants/index';
import type { FeedFormatInfo } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { getErrorMessage } from '../../utils/error.utils';

/** Result of feed generation operation */
interface FeedGenerationResult {
    success: boolean;
    itemCount: number;
    generatedAt: Date;
    downloadUrl?: string;
    errors: string[];
    warnings: string[];
}

/** Result of feed preview operation */
interface FeedPreviewResult {
    content: string;
    contentType: string;
    itemCount: number;
}

@Resolver()
export class DataHubFeedAdminResolver {
    private readonly logger: DataHubLogger;

    constructor(
        private feedGenerator: FeedGeneratorService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FEED_RESOLVER);
    }

    @Query()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async dataHubFeeds(@Ctx() ctx: RequestContext): Promise<FeedConfig[]> {
        return this.feedGenerator.getRegisteredFeeds(ctx);
    }

    @Query()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async dataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
    ): Promise<RegisteredFeedConfig | null> {
        return (await this.feedGenerator.getFeedById(ctx, id)) ?? null;
    }

    @Query()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async dataHubFeedFormats(): Promise<FeedFormatInfo[]> {
        return [...FEED_FORMATS];
    }

    @Mutation()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async createDataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('input') input: FeedConfig,
    ): Promise<FeedConfig> {
        return this.feedGenerator.createFeed(ctx, input);
    }

    @Mutation()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async updateDataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('input') input: FeedConfig,
    ): Promise<RegisteredFeedConfig> {
        const updated = await this.feedGenerator.updateFeed(ctx, id, input);
        if (!updated) throw new UserInputError(`Feed not found: ${String(id)}`);
        return updated;
    }

    @Mutation()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async deleteDataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
    ): Promise<DeletionResponse> {
        try {
            const deleted = await this.feedGenerator.deleteFeed(ctx, id);
            return {
                result: deleted ? DeletionResult.DELETED : DeletionResult.NOT_DELETED,
            };
        } catch (error) {
            this.logger.error('Failed to delete feed', error instanceof Error ? error : undefined, {
                feedId: String(id),
                error: getErrorMessage(error),
            });
            return {
                result: DeletionResult.NOT_DELETED,
                message: 'Failed to delete feed due to an internal error',
            };
        }
    }

    @Mutation()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async generateDataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('feedCode') feedCode: string,
    ): Promise<FeedGenerationResult> {
        try {
            const result = await this.feedGenerator.generateFeedArtifact(ctx, feedCode);
            return {
                success: true,
                itemCount: result.itemCount,
                generatedAt: result.generatedAt,
                downloadUrl: result.downloadUrl,
                errors: result.errors,
                warnings: result.warnings,
            };
        } catch (error) {
            this.logger.warn('Feed generation failed', { feedCode, error });
            return {
                success: false,
                itemCount: 0,
                generatedAt: new Date(),
                errors: [getErrorMessage(error)],
                warnings: [],
            };
        }
    }

    @Mutation()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async previewDataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('feedCode') feedCode: string,
        @Args('limit') limit: number = PAGINATION.FEED_PREVIEW_LIMIT,
    ): Promise<FeedPreviewResult> {
        const result = await this.feedGenerator.generateFeedPreview(
            ctx,
            feedCode,
            limit ?? PAGINATION.FEED_PREVIEW_LIMIT,
        );
        const previewContent = typeof result.content === 'string'
            ? result.content
            : result.content.toString('utf-8');

        return {
            content: previewContent,
            contentType: result.contentType,
            itemCount: result.itemCount,
        };
    }
}
