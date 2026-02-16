import { RequestContext, RequestContextService, ID } from '@vendure/core';
import { PipelineDefinition, JsonObject } from '../../types/index';
import { DataHubLogger } from '../../services/logger';
import { HookService } from '../../services/events/hook.service';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { CheckpointManager } from './checkpoint-manager';
import { getErrorMessage } from '../../utils/error.utils';

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
        options?: { resume?: boolean },
    ): Promise<RequestContext> {
        const resume = options?.resume ?? false;
        const pipelineCtx = await this.resolvePipelineContext(ctx, definition);

        // Handle checkpoint: clear for fresh runs, load for resume
        if (pipelineId && !resume) {
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
        result: { processed: number; succeeded: number; failed: number; details: JsonObject[]; counters: JsonObject; paused?: boolean; pausedAtStep?: string },
        pipelineId?: ID,
    ): Promise<{ processed: number; succeeded: number; failed: number; details?: JsonObject[]; paused?: boolean; pausedAtStep?: string }> {
        await this.checkpointManager.saveCheckpoint(ctx, pipelineId);

        result.details.push({ counters: result.counters });

        // If paused at a GATE step, skip completion hooks - the pipeline is not done yet
        if (!result.paused) {
            await this.hookService.run(ctx, definition, result.failed > 0 ? 'PIPELINE_FAILED' : 'PIPELINE_COMPLETED');
            this.publishPipelineDomainEvent(pipelineId, result);
        }

        return {
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
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
            const req = await this.requestContextService.create({
                apiType: ctx.apiType,
                channelOrToken: channelToken,
                languageCode: langFromContext as import('@vendure/core').LanguageCode | undefined,
            });
            if (req) return req;
        }

        return ctx;
    }

    /**
     * Publish pipeline completion or failure domain event
     */
    private publishPipelineDomainEvent(
        pipelineId: ID | undefined,
        result: { processed: number; succeeded: number; failed: number },
    ): void {
        try {
            const eventType = result.failed > 0 ? 'PIPELINE_FAILED' : 'PIPELINE_COMPLETED';
            this.domainEvents.publish(eventType, {
                pipelineId,
                processed: result.processed,
                succeeded: result.succeeded,
                failed: result.failed,
            });
        } catch (err) {
            this.logger.debug('Failed to publish domain event', {
                error: getErrorMessage(err),
            });
        }
    }
}
