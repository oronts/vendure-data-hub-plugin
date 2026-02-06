import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import type { PipelineDefinition, JsonObject } from '../../types';

@Injectable()
export class ErrorReplayService {
    constructor(private readonly adapterRuntime: AdapterRuntimeService) {}

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
