import type {
    ID,
    RequestContext,
} from '@vendure/core';
import type { Repository } from 'typeorm';
import type { PipelineRun } from '../../entities/pipeline';
import type {
    DataHubLogger,
    SpanContext,
} from '../logger';

export interface PipelineExecutionContext {
    ctx: RequestContext;
    run: PipelineRun;
    runId: ID;
    runRepo: Repository<PipelineRun>;
    runLogger: DataHubLogger;
    pipelineSpan: SpanContext;
    startTime: number;
    lockKey: string;
    lockToken?: string;
    lockRefreshTimer?: NodeJS.Timeout;
    lockLossError?: Error;
    isGateResume?: boolean;
}

export interface PipelineExecutionAttempt {
    attempt: number;
    maxAttempts: number;
}
