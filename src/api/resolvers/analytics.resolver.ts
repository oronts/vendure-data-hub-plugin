import { Args, Query, Resolver, Mutation } from '@nestjs/graphql';
import {
    Ctx,
    RequestContext,
    Allow,
    Transaction,
} from '@vendure/core';
import {
    AnalyticsService,
    WebhookRetryService,
    WebhookDeliveryStatus,
    ExportDestinationService,
    DestinationConfig,
} from '../../services';
import {
    ViewDataHubAnalyticsPermission,
    ManageDataHubWebhooksPermission,
    ManageDataHubDestinationsPermission,
} from '../../permissions';
import type {
    AnalyticsOverview,
    PipelinePerformance,
    ErrorAnalytics,
    ThroughputMetrics,
    RealTimeStats,
} from '../../services/analytics/analytics.types';
import type {
    WebhookDelivery,
    WebhookStats,
} from '../../services/webhooks/webhook.types';
import type {
    DeliveryResult,
    ConnectionTestResult,
} from '../../services/destinations/destination.types';
import { ConnectionType } from '../../constants/enums';
import { PAGINATION } from '../../constants/index';

/** Redacted destination config for API responses */
interface RedactedDestinationConfig extends Omit<DestinationConfig, 'secretAccessKey' | 'password' | 'privateKey'> {
    secretAccessKey?: string;
    password?: string;
    privateKey?: string;
}

/** Result of retry dead letter operation */
interface RetryDeadLetterResult {
    success: boolean;
    delivery: WebhookDelivery | null;
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

@Resolver()
export class DataHubAnalyticsAdminResolver {
    constructor(
        private analyticsService: AnalyticsService,
        private webhookRetryService: WebhookRetryService,
        private exportDestinationService: ExportDestinationService,
    ) {}

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubAnalyticsOverview(@Ctx() ctx: RequestContext): Promise<AnalyticsOverview> {
        return this.analyticsService.getOverview(ctx);
    }

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubPipelinePerformance(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: string; fromDate?: string; toDate?: string; limit?: number },
    ): Promise<PipelinePerformance[]> {
        return this.analyticsService.getPipelinePerformance(ctx, {
            pipelineId: args.pipelineId,
            limit: Math.min(args.limit ?? 100, PAGINATION.MAX_QUERY_LIMIT),
        });
    }

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubErrorAnalytics(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: string; fromDate?: string; toDate?: string },
    ): Promise<ErrorAnalytics> {
        return this.analyticsService.getErrorAnalytics(ctx, {
            pipelineId: args.pipelineId,
        });
    }

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubThroughputMetrics(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: string; intervalMinutes?: number; periods?: number },
    ): Promise<ThroughputMetrics> {
        return this.analyticsService.getThroughputMetrics(ctx, {
            pipelineId: args.pipelineId,
        });
    }

    @Query()
    @Allow(ViewDataHubAnalyticsPermission.Permission)
    async dataHubRealTimeStats(@Ctx() ctx: RequestContext): Promise<RealTimeStats> {
        return this.analyticsService.getRealTimeStats(ctx);
    }

    @Query()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubWebhookDeliveries(
        @Ctx() _ctx: RequestContext,
        @Args() args: { status?: string; webhookId?: string; limit?: number },
    ): Promise<WebhookDelivery[]> {
        return this.webhookRetryService.getDeliveries({
            status: args.status as WebhookDeliveryStatus | undefined,
            webhookId: args.webhookId,
            limit: Math.min(args.limit ?? 100, PAGINATION.MAX_QUERY_LIMIT),
        });
    }

    @Query()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubWebhookDelivery(
        @Ctx() _ctx: RequestContext,
        @Args() args: { deliveryId: string },
    ): Promise<WebhookDelivery | undefined> {
        return this.webhookRetryService.getDelivery(args.deliveryId);
    }

    @Query()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubDeadLetterQueue(@Ctx() _ctx: RequestContext): Promise<WebhookDelivery[]> {
        return this.webhookRetryService.getDeadLetterQueue();
    }

    @Query()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubWebhookStats(@Ctx() _ctx: RequestContext): Promise<WebhookStats> {
        return this.webhookRetryService.getStats();
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubRetryDeadLetter(
        @Ctx() _ctx: RequestContext,
        @Args() args: { deliveryId: string },
    ): Promise<RetryDeadLetterResult> {
        const result = await this.webhookRetryService.retryDeadLetter(args.deliveryId);
        return {
            success: result !== null,
            delivery: result,
        };
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubWebhooksPermission.Permission)
    async dataHubRemoveDeadLetter(
        @Ctx() _ctx: RequestContext,
        @Args() args: { deliveryId: string },
    ): Promise<RemoveDeadLetterResult> {
        const success = this.webhookRetryService.removeDeadLetter(args.deliveryId);
        return { success };
    }

    @Query()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubExportDestinations(@Ctx() _ctx: RequestContext): Promise<RedactedDestinationConfig[]> {
        return this.exportDestinationService.getDestinations().map(dest => this.redactDestinationSecrets(dest));
    }

    @Query()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubExportDestination(
        @Ctx() _ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<RedactedDestinationConfig | null> {
        const dest = this.exportDestinationService.getDestination(args.id);
        if (!dest) return null;
        return this.redactDestinationSecrets(dest);
    }

    private redactDestinationSecrets(dest: DestinationConfig): RedactedDestinationConfig {
        return {
            ...dest,
            secretAccessKey: dest.type === 'S3' ? '***' : undefined,
            password: (['SFTP', 'FTP'] as const).includes(dest.type as 'SFTP' | 'FTP') ? '***' : undefined,
            privateKey: dest.type === 'SFTP' ? '***' : undefined,
        };
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubRegisterExportDestination(
        @Ctx() _ctx: RequestContext,
        @Args() args: { input: DestinationConfig },
    ): Promise<RegisterDestinationResult> {
        this.exportDestinationService.registerDestination(args.input);
        return { success: true, id: args.input.id };
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubTestExportDestination(
        @Ctx() _ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<ConnectionTestResult> {
        return this.exportDestinationService.testDestination(args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(ManageDataHubDestinationsPermission.Permission)
    async dataHubDeliverToDestination(
        @Ctx() _ctx: RequestContext,
        @Args() args: { destinationId: string; content: string; filename: string; mimeType?: string },
    ): Promise<DeliveryResult> {
        return this.exportDestinationService.deliver(
            args.destinationId,
            args.content,
            args.filename,
            { mimeType: args.mimeType },
        );
    }
}
