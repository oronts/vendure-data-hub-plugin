import { RequestContext, RequestContextService, ID } from '@vendure/core';
import { PipelineDefinition, JsonObject } from '../../types/index';
import { DataHubLogger } from '../../services/logger';
import { HookService } from '../../services/events/hook.service';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { CheckpointManager } from './checkpoint-manager';
import { getErrorMessage } from '../../utils/error.utils';
import { createChannelRequestContext } from './channel-request-context';

/**
 * Manages pipeline execution lifecycle: preparation and finalization
 */
export class ExecutionLifecycleManager {
    constructor(
        private requestContextService: RequestContextService,
        private checkpointManager: CheckpointManager,
        private hookService: HookService,
        private domainEvents: DomainEventsService,
        private logger: DataHubLogger,
    ) {}

    /**
     * Prepare execution context for pipeline execution
     */
    async prepareExecution(
        ctx: RequestContext,
        definition: PipelineDefinition,
        pipelineId?: ID,
        runId?: ID,
        options?: { resume?: boolean; resetCheckpoint?: boolean },
    ): Promise<RequestContext> {
        const pipelineCtx = await this.resolvePipelineContext(ctx, definition);

        if (pipelineId && options?.resetCheckpoint === true) {
            await this.checkpointManager.clearCheckpoint(ctx, pipelineId);
        }
        await this.checkpointManager.loadCheckpoint(ctx, pipelineId);

        return pipelineCtx;
    }

    /**
     * Finalize execution: save checkpoint, run hooks, publish domain events
     */
    async finalizeExecution(
        ctx: RequestContext,
        definition: PipelineDefinition,
        result: { processed: number; succeeded: number; failed: number; skipped: number; details: JsonObject[]; counters: JsonObject; paused?: boolean; pausedAtStep?: string; cancelled?: boolean },
        pipelineId?: ID,
    ): Promise<{ processed: number; succeeded: number; failed: number; skipped: number; sourceRecords: number; details?: JsonObject[]; paused?: boolean; pausedAtStep?: string }> {
        if (!result.cancelled) {
            await this.checkpointManager.saveCheckpoint(ctx, pipelineId);
        }

        result.details.push({ counters: result.counters });

        // Skip hooks if paused (gate) or cancelled (user abort)
        if (!result.paused && !result.cancelled) {
            await this.hookService.run(ctx, definition, 'PIPELINE_COMPLETED');
            this.publishPipelineCompleted(pipelineId, result);
        }

        return {
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            skipped: result.skipped,
            sourceRecords: Number(result.counters['extracted'] ?? 0),
            details: result.details,
            paused: result.paused,
            pausedAtStep: result.pausedAtStep,
        };
    }

    /**
     * Resolve pipeline context with proper channel and language
     */
    async resolvePipelineContext(
        ctx: RequestContext,
        definition: PipelineDefinition,
    ): Promise<RequestContext> {
        const channelFromContext = definition.context?.channel;
        const langFromContext = definition.context?.contentLanguage;

        if (channelFromContext || langFromContext) {
            // Extract channel token from context if available
            const channelToken = channelFromContext ?? ctx.channel?.token;
            return createChannelRequestContext(
                this.requestContextService,
                ctx,
                channelToken,
                langFromContext as import('@vendure/core').LanguageCode | undefined,
            );
        }

        return ctx;
    }

    /**
     * Publish pipeline completion or failure domain event
     */
    private publishPipelineCompleted(
        pipelineId: ID | undefined,
        result: { processed: number; succeeded: number; failed: number; skipped: number },
    ): void {
        try {
            this.domainEvents.publish('PIPELINE_COMPLETED', {
                pipelineId,
                processed: result.processed,
                succeeded: result.succeeded,
                failed: result.failed,
                skipped: result.skipped,
            });
        } catch (err) {
            this.logger.debug('Failed to publish domain event', {
                error: getErrorMessage(err),
            });
        }
    }
}
