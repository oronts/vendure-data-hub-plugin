import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import type { PipelineDefinition, JsonObject } from '../../types';

/**
 * Service facade for error replay functionality.
 *
 * This service provides an abstraction layer between the API resolvers
 * and the runtime layer, following the architecture: api/ -> services/ -> runtime/
 *
 * Resolvers should use this service instead of directly accessing AdapterRuntimeService.
 */
@Injectable()
export class ErrorReplayService {
    constructor(private readonly adapterRuntime: AdapterRuntimeService) {}

    /**
     * Replay a failed record from a specific step in the pipeline.
     *
     * @param ctx - The request context
     * @param definition - The pipeline definition
     * @param stepKey - The step key where the error occurred
     * @param payload - The record payload to replay
     * @returns The result of the replay operation
     */
    async replayRecord(
        ctx: RequestContext,
        definition: PipelineDefinition,
        stepKey: string,
        payload: JsonObject,
    ): Promise<{ processed: number; succeeded: number; failed: number }> {
        return this.adapterRuntime.replayFromStep(
            ctx,
            definition,
            stepKey,
            [payload],
            undefined,
            // Suppress error callback - the original error is already recorded
            async () => {},
        );
    }

    /**
     * Replay multiple failed records from a specific step.
     *
     * @param ctx - The request context
     * @param definition - The pipeline definition
     * @param stepKey - The step key where the errors occurred
     * @param payloads - The record payloads to replay
     * @returns The result of the replay operation
     */
    async replayRecords(
        ctx: RequestContext,
        definition: PipelineDefinition,
        stepKey: string,
        payloads: JsonObject[],
    ): Promise<{ processed: number; succeeded: number; failed: number }> {
        return this.adapterRuntime.replayFromStep(
            ctx,
            definition,
            stepKey,
            payloads,
            undefined,
            async () => {},
        );
    }
}
