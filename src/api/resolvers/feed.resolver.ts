import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext, Allow, Transaction } from '@vendure/core';
import { FeedGeneratorService, FeedConfig } from '../../feeds/feed-generator.service';
import { ManageDataHubFeedsPermission } from '../../permissions';
import { PAGINATION, FEED_FORMATS, LOGGER_CONTEXTS } from '../../constants/index';
import type { FeedFormatInfo } from '../../constants/index';
import { DataHubLogger } from '../../services/logger';
import { getErrorMessage } from '../../utils/error.utils';

const logger = new DataHubLogger(LOGGER_CONTEXTS.FEED_RESOLVER);

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
    constructor(
        private feedGenerator: FeedGeneratorService,
    ) {}

    @Query()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async dataHubFeeds(): Promise<FeedConfig[]> {
        return this.feedGenerator.getRegisteredFeeds();
    }

    @Query()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async dataHubFeedFormats(): Promise<FeedFormatInfo[]> {
        return [...FEED_FORMATS];
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async createDataHubFeed(
        @Args('input') input: FeedConfig,
    ): Promise<FeedConfig> {
        this.feedGenerator.registerFeed(input);
        return input;
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async generateDataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('feedCode') feedCode: string,
    ): Promise<FeedGenerationResult> {
        try {
            const result = await this.feedGenerator.generateFeed(ctx, feedCode);
            return {
                success: true,
                itemCount: result.itemCount,
                generatedAt: result.generatedAt,
                downloadUrl: `/data-hub/feeds/${feedCode}/download`,
                errors: result.errors,
                warnings: result.warnings,
            };
        } catch (error) {
            logger.warn('Feed generation failed', { feedCode, error });
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
    @Transaction()
    @Allow(ManageDataHubFeedsPermission.Permission)
    async previewDataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('feedCode') feedCode: string,
        @Args('limit') limit: number = PAGINATION.FEED_PREVIEW_LIMIT,
    ): Promise<FeedPreviewResult> {
        const validatedLimit = Math.min(Math.max(limit || PAGINATION.FEED_PREVIEW_LIMIT, 1), PAGINATION.FEED_PREVIEW_LIMIT * 100);
        const result = await this.feedGenerator.generateFeed(ctx, feedCode);
        let previewContent = typeof result.content === 'string'
            ? result.content
            : result.content.toString('utf-8');

        const lines = previewContent.split('\n');
        const previewLineLimit = validatedLimit + 10;
        if (lines.length > previewLineLimit) {
            previewContent = lines.slice(0, previewLineLimit).join('\n') + '\n...(truncated)';
        }

        return {
            content: previewContent,
            contentType: result.contentType,
            itemCount: result.itemCount,
        };
    }
}
