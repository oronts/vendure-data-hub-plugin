import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext, Allow, Permission } from '@vendure/core';
import { FeedGeneratorService, FeedConfig } from '../../feeds/feed-generator.service';
import { DEFAULTS, FEED_FORMATS } from '../../constants/index';
import type { FeedFormatInfo } from '../../constants/index';

@Resolver()
export class DataHubFeedAdminResolver {
    constructor(
        private feedGenerator: FeedGeneratorService,
    ) {}

    // FEED QUERIES

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubFeeds(): Promise<FeedConfig[]> {
        return this.feedGenerator.getRegisteredFeeds();
    }

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubFeedFormats(): Promise<FeedFormatInfo[]> {
        return [...FEED_FORMATS];
    }

    // FEED MUTATIONS

    @Mutation()
    @Allow(Permission.UpdateSettings)
    async registerDataHubFeed(
        @Args('input') input: FeedConfig,
    ): Promise<FeedConfig> {
        this.feedGenerator.registerFeed(input);
        return input;
    }

    @Mutation()
    @Allow(Permission.ReadSettings)
    async generateDataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('feedCode') feedCode: string,
    ): Promise<{
        success: boolean;
        itemCount: number;
        generatedAt: Date;
        downloadUrl?: string;
        errors: string[];
        warnings: string[];
    }> {
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
            return {
                success: false,
                itemCount: 0,
                generatedAt: new Date(),
                errors: [error instanceof Error ? error.message : 'Unknown error'],
                warnings: [],
            };
        }
    }

    @Mutation()
    @Allow(Permission.ReadSettings)
    async previewDataHubFeed(
        @Ctx() ctx: RequestContext,
        @Args('feedCode') feedCode: string,
        @Args('limit') limit: number = DEFAULTS.FEED_PREVIEW_LIMIT,
    ): Promise<{
        content: string;
        contentType: string;
        itemCount: number;
    }> {
        const result = await this.feedGenerator.generateFeed(ctx, feedCode);
        // Truncate content for preview
        let previewContent = typeof result.content === 'string'
            ? result.content
            : result.content.toString('utf-8');

        // Limit preview to first N lines
        const lines = previewContent.split('\n');
        if (lines.length > limit + 10) {
            previewContent = lines.slice(0, limit + 10).join('\n') + '\n...(truncated)';
        }

        return {
            content: previewContent,
            contentType: result.contentType,
            itemCount: result.itemCount,
        };
    }
}
