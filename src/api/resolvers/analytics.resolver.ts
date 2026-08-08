import { Args, Query, Resolver, Mutation } from '@nestjs/graphql';
import {
    DeletionResponse,
    DeletionResult,
} from '@vendure/common/lib/generated-types';
import { Ctx, ID, RequestContext, Allow, Transaction } from '@vendure/core';
import {
    AnalyticsService,
    WebhookRetryService,
    WebhookDeliveryStatus,
    ExportDestinationService,
    DestinationConfig,
    FileStorageService,
} from '../../services';
import {
    ViewDataHubAnalyticsPermission,
    ManageDataHubWebhooksPermission,
    ManageDataHubDestinationsPermission,
    ReadDataHubFilesPermission,
} from '../../permissions';
import type {
    AnalyticsOverview,
    PipelinePerformance,
    ErrorAnalytics,
    ThroughputMetrics,
    RealTimeStats,
    TimeRange,
} from '../../services/analytics/analytics.types';
import type {
    WebhookDeliverySummary,
    WebhookStats,
} from '../../services/webhooks/webhook.types';
import type { DeliveryResult } from '../../services/destinations/destination.types';
import type { ConnectionTestResult } from '../../../shared/types';
import { PAGINATION } from '../../constants/index';
import { summarizeWebhookDelivery } from '../../services/webhooks/webhook.helpers';

/** Result of retry dead letter operation */
interface RetryDeadLetterResult {
    success: boolean;
    delivery: WebhookDeliverySummary | null;
}

/** Result of remove dead letter operation */
interface RemoveDeadLetterResult {
    success: boolean;
}

/** Result of registering export destination */
interface RegisterDestinationResult {
    success: boolean;
    id: string;
}

const ANALYTICS_TIME_RANGES = new Set<TimeRange>(['1h', '24h', '7d', '30d', '90d']);

function parseAnalyticsTimeRange(value: string | undefined, fallback: TimeRange): TimeRange {
    const range = value ?? fallback;
    if (!ANALYTICS_TIME_RANGES.has(range as TimeRange)) {
        throw new Error(`Unsupported analytics time range: ${range}`);
    }
    return range as TimeRange;
}

function parsePositiveLimit(value: number | undefined, fallback: number): number {
    const limit = value ?? fallback;
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error('Limit must be a positive integer');
    }
    return Math.min(limit, PAGINATION.MAX_QUERY_LIMIT);
}

@Resolver()
export class DataHubAnalyticsAdminResolver {
    constructor(
        private analyticsService: AnalyticsService,
        private webhookRetryService: WebhookRetryService,
        private exportDestinationService: ExportDestinationService,
        private fileStorageService: FileStorageService,
    ) {}

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubAnalyticsOverview(
        @Ctx() ctx: RequestContext,
    ): Promise<AnalyticsOverview> {
        return this.analyticsService.getOverview(ctx);
    }

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubPipelinePerformance(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: ID; timeRange?: string; limit?: number },
    ): Promise<PipelinePerformance[]> {
        return this.analyticsService.getPipelinePerformance(ctx, {
            pipelineId: args.pipelineId,
            timeRange: parseAnalyticsTimeRange(args.timeRange, '30d'),
            limit: parsePositiveLimit(args.limit, 100),
        });
    }

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubErrorAnalytics(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: ID; timeRange?: string },
    ): Promise<ErrorAnalytics> {
        return this.analyticsService.getErrorAnalytics(ctx, {
            pipelineId: args.pipelineId,
            timeRange: parseAnalyticsTimeRange(args.timeRange, '7d'),
        });
    }

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubThroughputMetrics(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: ID; timeRange?: string },
    ): Promise<ThroughputMetrics> {
        return this.analyticsService.getThroughputMetrics(ctx, {
            pipelineId: args.pipelineId,
            timeRange: parseAnalyticsTimeRange(args.timeRange, '24h'),
        });
    }

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubRealTimeStats(
        @Ctx() ctx: RequestContext,
    ): Promise<RealTimeStats> {
        return this.analyticsService.getRealTimeStats(ctx);
    }

    @Query()
    @Allow(ReadDataHubFilesPermission.Permission)
    async dataHubStorageStats(@Ctx() ctx: RequestContext): Promise<{
        totalFiles: number;
        totalSize: number;
        byMimeType: Record<string, { count: number; size: number }>;
    }> {
        const stats = await this.fileStorageService.getStorageStats(ctx);
        return {
            totalFiles: stats.totalFiles,
            totalSize: stats.totalSize,
            byMimeType: stats.byMimeType,
        };
    }

    @Query()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubWebhookDeliveries(
        @Ctx() ctx: RequestContext,
        @Args() args: { status?: string; webhookId?: string; limit?: number },
    ): Promise<WebhookDeliverySummary[]> {
        const deliveries = await this.webhookRetryService.getDeliveries(ctx, {
            status: args.status as WebhookDeliveryStatus | undefined,
            webhookId: args.webhookId,
            limit: parsePositiveLimit(args.limit, 100),
        });
        return deliveries.map(summarizeWebhookDelivery);
    }

    @Query()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubWebhookDelivery(
        @Ctx() ctx: RequestContext,
        @Args() args: { deliveryId: string },
    ): Promise<WebhookDeliverySummary | undefined> {
        const delivery = await this.webhookRetryService.getDelivery(
            ctx,
            args.deliveryId,
        );
        return delivery ? summarizeWebhookDelivery(delivery) : undefined;
    }

    @Query()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubDeadLetterQueue(
        @Ctx() ctx: RequestContext,
    ): Promise<WebhookDeliverySummary[]> {
        const deliveries =
            await this.webhookRetryService.getDeadLetterQueue(ctx);
        return deliveries.map(summarizeWebhookDelivery);
    }

    @Query()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubWebhookStats(
        @Ctx() ctx: RequestContext,
    ): Promise<WebhookStats> {
        return this.webhookRetryService.getStats(ctx);
    }

    @Mutation()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubRetryDeadLetter(
        @Ctx() ctx: RequestContext,
        @Args() args: { deliveryId: string },
    ): Promise<RetryDeadLetterResult> {
        const result = await this.webhookRetryService.retryDeadLetter(
            ctx,
            args.deliveryId,
        );
        return {
            success: result !== null,
            delivery: result ? summarizeWebhookDelivery(result) : null,
        };
    }

    @Mutation()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubRemoveDeadLetter(
        @Ctx() ctx: RequestContext,
        @Args() args: { deliveryId: string },
    ): Promise<RemoveDeadLetterResult> {
        const success = await this.webhookRetryService.removeDeadLetter(
            ctx,
            args.deliveryId,
        );
        return { success };
    }

    @Query()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubExportDestinations(
        @Ctx() ctx: RequestContext,
    ): Promise<DestinationConfig[]> {
        return this.exportDestinationService.getDestinations(ctx);
    }

    @Query()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubExportDestination(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<DestinationConfig | null> {
        return (await this.exportDestinationService.getDestination(ctx, args.id)) ?? null;
    }

    @Mutation()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubRegisterExportDestination(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: DestinationConfig },
    ): Promise<RegisterDestinationResult> {
        await this.exportDestinationService.createDestination(
            ctx,
            args.input,
        );
        return { success: true, id: args.input.id };
    }

    @Mutation()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubDeleteExportDestination(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<DeletionResponse> {
        const deleted = await this.exportDestinationService.deleteDestination(
            ctx,
            args.id,
        );
        return {
            result: deleted
                ? DeletionResult.DELETED
                : DeletionResult.NOT_DELETED,
        };
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubTestExportDestination(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<ConnectionTestResult> {
        return this.exportDestinationService.testDestination(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubDeliverToDestination(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            destinationId: string;
            content: string;
            filename: string;
            mimeType?: string;
        },
    ): Promise<DeliveryResult> {
        return this.exportDestinationService.deliver(
            ctx,
            args.destinationId,
            args.content,
            args.filename,
            { mimeType: args.mimeType },
        );
    }
}
