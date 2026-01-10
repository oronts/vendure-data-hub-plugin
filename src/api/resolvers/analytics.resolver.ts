import { Args, Query, Resolver, Mutation } from '@nestjs/graphql';
import {
    Ctx,
    RequestContext,
    Allow,
    Permission,
    Transaction,
} from '@vendure/core';
import { AnalyticsService, WebhookRetryService, WebhookDeliveryStatus, ExportDestinationService, DestinationConfig } from '../../services';

@Resolver()
export class DataHubAnalyticsAdminResolver {
    constructor(
        private analyticsService: AnalyticsService,
        private webhookRetryService: WebhookRetryService,
        private exportDestinationService: ExportDestinationService,
    ) {}

    // ANALYTICS QUERIES

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubAnalyticsOverview(@Ctx() ctx: RequestContext) {
        return this.analyticsService.getOverview(ctx);
    }

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubPipelinePerformance(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: string; fromDate?: string; toDate?: string; limit?: number },
    ) {
        return this.analyticsService.getPipelinePerformance(ctx, {
            pipelineId: args.pipelineId,
            limit: args.limit,
        });
    }

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubErrorAnalytics(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: string; fromDate?: string; toDate?: string },
    ) {
        return this.analyticsService.getErrorAnalytics(ctx, {
            pipelineId: args.pipelineId,
        });
    }

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubThroughputMetrics(
        @Ctx() ctx: RequestContext,
        @Args() args: { pipelineId?: string; intervalMinutes?: number; periods?: number },
    ) {
        return this.analyticsService.getThroughputMetrics(ctx, {
            pipelineId: args.pipelineId,
        });
    }

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubRealTimeStats(@Ctx() ctx: RequestContext) {
        return this.analyticsService.getRealTimeStats(ctx);
    }

    // WEBHOOK QUERIES & MUTATIONS

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubWebhookDeliveries(
        @Args() args: { status?: string; webhookId?: string; limit?: number },
    ) {
        return this.webhookRetryService.getDeliveries({
            status: args.status as WebhookDeliveryStatus | undefined,
            webhookId: args.webhookId,
            limit: args.limit,
        });
    }

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubWebhookDelivery(@Args() args: { deliveryId: string }) {
        return this.webhookRetryService.getDelivery(args.deliveryId);
    }

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubDeadLetterQueue() {
        return this.webhookRetryService.getDeadLetterQueue();
    }

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubWebhookStats() {
        return this.webhookRetryService.getStats();
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateSettings)
    async dataHubRetryDeadLetter(@Args() args: { deliveryId: string }) {
        const result = await this.webhookRetryService.retryDeadLetter(args.deliveryId);
        return {
            success: result !== null,
            delivery: result,
        };
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateSettings)
    async dataHubRemoveDeadLetter(@Args() args: { deliveryId: string }) {
        const success = this.webhookRetryService.removeDeadLetter(args.deliveryId);
        return { success };
    }

    // EXPORT DESTINATION QUERIES & MUTATIONS

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubExportDestinations() {
        return this.exportDestinationService.getDestinations().map(dest => ({
            ...dest,
            // Redact sensitive fields
            secretAccessKey: dest.type === 's3' ? '***' : undefined,
            password: ['sftp', 'ftp'].includes(dest.type) ? '***' : undefined,
            privateKey: dest.type === 'sftp' ? '***' : undefined,
        }));
    }

    @Query()
    @Allow(Permission.ReadSettings)
    async dataHubExportDestination(@Args() args: { id: string }) {
        const dest = this.exportDestinationService.getDestination(args.id);
        if (!dest) return null;
        return {
            ...dest,
            // Redact sensitive fields
            secretAccessKey: dest.type === 's3' ? '***' : undefined,
            password: ['sftp', 'ftp'].includes(dest.type) ? '***' : undefined,
            privateKey: dest.type === 'sftp' ? '***' : undefined,
        };
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateSettings)
    async dataHubRegisterExportDestination(
        @Args() args: { input: DestinationConfig },
    ) {
        this.exportDestinationService.registerDestination(args.input);
        return { success: true, id: args.input.id };
    }

    @Mutation()
    @Allow(Permission.UpdateSettings)
    async dataHubTestExportDestination(@Args() args: { id: string }) {
        return this.exportDestinationService.testDestination(args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateSettings)
    async dataHubDeliverToDestination(
        @Args() args: { destinationId: string; content: string; filename: string; mimeType?: string },
    ) {
        return this.exportDestinationService.deliver(
            args.destinationId,
            args.content,
            args.filename,
            { mimeType: args.mimeType },
        );
    }
}
