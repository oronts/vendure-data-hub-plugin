import type { ID } from '@vendure/core';
import type { PipelineRun } from '../../entities/pipeline';
import type { SeededInputMode } from '../../runtime/orchestration';

export interface SeededRunOptions {
    triggerKey: string;
    skipPermissionCheck?: boolean;
    triggeredBy?: string;
    seedMode?: SeededInputMode;
    deferQueueEnqueue?: boolean;
    expectedRevisionId?: ID;
}

export interface IdempotentSeededRunOptions extends SeededRunOptions {
    idempotencyKey: string;
    idempotencyTtlSeconds: number;
    requestFingerprint: string;
}

export interface IdempotentSeededRunResult {
    run: PipelineRun;
    duplicate: boolean;
}
