import type { ID, RequestContext } from '@vendure/core';
import type { ConnectionService } from '../../services/config/connection.service';
import type { SecretService } from '../../services/config/secret.service';
import type { DataHubLogger } from '../../services/logger';
import type { ExtractContext } from '../../sdk/types';
import type {
    ExtractorContext,
    JsonObject,
    PipelineStepDefinition,
} from '../../types';
import { deepClone } from '../../utils/object-path.utils';
import type { ExecutorContext, RecordObject } from '../executor-types';
import {
    createConnectionsAdapter,
    createLoggerAdapter,
    createSecretsAdapter,
} from './context-adapters';

interface ExtractContextDependencies {
    readonly secretService: SecretService;
    readonly connectionService: ConnectionService;
    readonly logger: DataHubLogger;
}

interface ExtractContextOptions extends ExtractContextDependencies {
    readonly ctx: RequestContext;
    readonly step: PipelineStepDefinition;
    readonly executorCtx: ExecutorContext;
    readonly pipelineId?: ID;
    readonly runId?: ID;
    readonly sourceRecords?: readonly JsonObject[];
}

export function normalizeRecordLimit(limit: number | undefined): number | undefined {
    if (limit === undefined) {
        return undefined;
    }
    if (!Number.isFinite(limit)) {
        throw new Error('Extractor record limit must be a finite number');
    }
    return Math.max(0, Math.floor(limit));
}

export function normalizeExecutorRecordLimit(
    executorCtx: ExecutorContext,
): ExecutorContext {
    const recordLimit = normalizeRecordLimit(executorCtx.recordLimit);
    return recordLimit === executorCtx.recordLimit
        ? executorCtx
        : { ...executorCtx, recordLimit };
}

export function hasReachedRecordLimit(
    recordCount: number,
    executorCtx: ExecutorContext,
): boolean {
    return executorCtx.recordLimit !== undefined
        && recordCount >= executorCtx.recordLimit;
}

export function materializeRecords(
    records: readonly JsonObject[],
    executorCtx: ExecutorContext,
): RecordObject[] {
    const limit = executorCtx.recordLimit ?? records.length;
    return records
        .slice(0, limit)
        .map(record => deepClone(record));
}

export function materializeRecord(record: JsonObject): RecordObject {
    return deepClone(record);
}

export function createInternalExtractorContext(
    options: ExtractContextOptions,
): ExtractorContext {
    const {
        ctx,
        step,
        executorCtx,
        pipelineId,
        runId,
        sourceRecords,
        secretService,
        connectionService,
        logger,
    } = options;

    return {
        ctx,
        pipelineId: pipelineId ?? '0',
        runId: runId ?? '0',
        stepKey: step.key,
        checkpoint: {
            data: deepClone(executorCtx.cpData?.[step.key] as JsonObject ?? {}),
        },
        sourceRecords: sourceRecords?.map(record => deepClone(record)),
        logger: createLoggerAdapter(logger),
        secrets: createSecretsAdapter(secretService, ctx),
        connections: createConnectionsAdapter(
            connectionService,
            ctx,
        ) as ExtractorContext['connections'],
        dryRun: executorCtx.recordLimit !== undefined,
        setCheckpoint: data => storeCheckpoint(executorCtx, step.key, data),
        isCancelled: executorCtx.onCancelRequested ?? (async () => false),
    };
}

export function createSdkExtractorContext(
    options: ExtractContextOptions,
): ExtractContext {
    const {
        ctx,
        step,
        executorCtx,
        pipelineId,
        runId,
        sourceRecords,
        secretService,
        connectionService,
        logger,
    } = options;

    return {
        ctx,
        pipelineId: pipelineId ?? '0',
        runId: runId ?? '0',
        stepKey: step.key,
        checkpoint: deepClone(executorCtx.cpData?.[step.key] ?? {}),
        sourceRecords: sourceRecords?.map(record => deepClone(record)),
        logger: createLoggerAdapter(logger),
        secrets: createSecretsAdapter(secretService, ctx),
        connections: createConnectionsAdapter(connectionService, ctx),
        dryRun: executorCtx.recordLimit !== undefined,
        setCheckpoint: data => storeCheckpoint(executorCtx, step.key, data),
        isCancelled: executorCtx.onCancelRequested ?? (async () => false),
    };
}

function storeCheckpoint(
    executorCtx: ExecutorContext,
    stepKey: string,
    data: JsonObject,
): void {
    if (!executorCtx.cpData) {
        return;
    }
    executorCtx.cpData[stepKey] = deepClone(data);
    executorCtx.markCheckpointDirty();
}
