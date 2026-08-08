import type { ID } from '@vendure/core';

import type { JsonObject, JsonValue } from '../../types/index';

export type LogEventType =
    | 'pipeline.start'
    | 'pipeline.complete'
    | 'pipeline.fail'
    | 'step.start'
    | 'step.complete'
    | 'step.fail'
    | 'record.error'
    | 'transform.mapping'
    | 'extract.source'
    | 'load.target'
    | 'debug';

export interface LogEventOptions {
    pipelineId?: ID;
    runId?: ID;
    stepKey?: string;
    durationMs?: number;
    recordsProcessed?: number;
    recordsFailed?: number;
    recordsIn?: number;
    recordsOut?: number;
    context?: JsonObject;
    metadata?: JsonObject;
}

export interface FieldMappingInfo {
    sourceField: string;
    targetField: string;
    transformType?: string;
    sampleSourceValue?: JsonValue;
    sampleTargetValue?: JsonValue;
}

export interface StepExecutionInfo {
    stepKey: string;
    stepType: string;
    adapterCode?: string;
    recordsIn: number;
    recordsOut: number;
    succeeded: number;
    failed: number;
    skipped?: number;
    durationMs: number;
    sampleRecord?: JsonObject;
    fieldMappings?: FieldMappingInfo[];
}
