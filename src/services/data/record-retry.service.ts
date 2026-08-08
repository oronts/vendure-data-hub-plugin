import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import type { JsonObject, PipelineDefinition, PipelineStepDefinition } from '../../types';
import { DataHubRecordError } from '../../entities/data';
import { PipelineRun } from '../../entities/pipeline';
import { LOADER_ADAPTERS } from '../../runtime/executors/loaders/registry/loader-adapter-definitions';
import { LOGGER_CONTEXTS } from '../../constants';
import { getErrorMessage } from '../../utils/error.utils';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { ErrorReplayService } from './error-replay.service';
import { RecordErrorService } from './record-error.service';
import { RecordRetryAuditService } from './record-retry-audit.service';
import { getActivePipelineRunChannelId } from '../pipeline/pipeline-run-channel';

export const RECORD_RETRY_OUTCOME = {
    APPLIED: 'APPLIED',
    RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
    RUN_NOT_FOUND: 'RUN_NOT_FOUND',
    PIPELINE_NOT_FOUND: 'PIPELINE_NOT_FOUND',
    STEP_NOT_FOUND: 'STEP_NOT_FOUND',
    PATCH_REJECTED: 'PATCH_REJECTED',
    REPLAY_FAILED: 'REPLAY_FAILED',
} as const;

export type RecordRetryOutcome =
    typeof RECORD_RETRY_OUTCOME[keyof typeof RECORD_RETRY_OUTCOME];

export interface RecordRetryResult {
    success: boolean;
    outcome: RecordRetryOutcome;
    message: string;
    errorId: ID;
    runId: ID | null;
    stepKey: string | null;
    adapterCode: string | null;
    definitionVersion: number | null;
    appliedPatch: JsonObject;
    rejectedPatchKeys: string[];
    processed: number;
    succeeded: number;
    failed: number;
    auditId: ID | null;
    auditRecorded: boolean;
}

export function resolveStepAdapterCode(
    step: PipelineStepDefinition,
): string | null {
    const nested = step.config?.adapterCode;
    if (typeof nested === 'string' && nested.trim()) {
        return nested;
    }
    return typeof step.adapterCode === 'string' && step.adapterCode.trim()
        ? step.adapterCode
        : null;
}

@Injectable()
export class RecordRetryService {
    private readonly logger: DataHubLogger;

    constructor(
        private readonly recordErrors: RecordErrorService,
        private readonly errorReplay: ErrorReplayService,
        private readonly connection: TransactionalConnection,
        private readonly retryAudits: RecordRetryAuditService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ERROR_RESOLVER);
    }

    async retry(
        ctx: RequestContext,
        errorId: ID,
        requestedPatch: JsonObject = {},
    ): Promise<RecordRetryResult> {
        const record = await this.recordErrors.getById(ctx, errorId);
        if (!record) {
            return this.failure(
                errorId,
                RECORD_RETRY_OUTCOME.RECORD_NOT_FOUND,
                'Record error not found',
            );
        }

        const channelId = getActivePipelineRunChannelId(ctx);
        const run = await this.connection.getRepository(ctx, PipelineRun).findOne({
            where: { id: record.runId, channelId },
            relations: { pipeline: true },
        });
        if (!run) {
            return this.failure(
                errorId,
                RECORD_RETRY_OUTCOME.RUN_NOT_FOUND,
                'Pipeline run not found',
                record,
            );
        }
        if (!run.pipeline) {
            return this.failure(
                errorId,
                RECORD_RETRY_OUTCOME.PIPELINE_NOT_FOUND,
                'Pipeline for retry run not found',
                record,
                run.id,
            );
        }

        const definition = run.definitionSnapshot;
        if (!definition) {
            return this.failure(
                errorId,
                RECORD_RETRY_OUTCOME.STEP_NOT_FOUND,
                'Pipeline run has no immutable definition snapshot',
                record,
                run.id,
            );
        }
        const step = definition.steps.find(candidate => candidate.key === record.stepKey);
        if (!step) {
            return this.failure(
                errorId,
                RECORD_RETRY_OUTCOME.STEP_NOT_FOUND,
                `Pipeline step "${record.stepKey}" was not found in the run snapshot`,
                record,
                run.id,
                definition,
            );
        }

        const adapterCode = resolveStepAdapterCode(step);
        const patchResult = this.validatePatch(adapterCode, requestedPatch);
        if (patchResult.rejectedPatchKeys.length > 0) {
            return {
                ...this.failure(
                    errorId,
                    RECORD_RETRY_OUTCOME.PATCH_REJECTED,
                    `Patch contains fields that are not allowed for adapter "${adapterCode ?? 'unknown'}"`,
                    record,
                    run.id,
                    definition,
                    adapterCode,
                ),
                rejectedPatchKeys: patchResult.rejectedPatchKeys,
            };
        }

        const payloadBefore = record.payload ?? {};
        const resultingPayload: JsonObject = {
            ...payloadBefore,
            ...patchResult.appliedPatch,
        };

        let replayResult: {
            processed: number;
            succeeded: number;
            failed: number;
        };
        try {
            await this.recordErrors.notifyRetry(ctx, record);
            replayResult = await this.errorReplay.replayRecord(
                ctx,
                definition,
                record.stepKey,
                resultingPayload,
            );
        } catch (error) {
            this.logger.warn('Record retry replay failed', {
                errorId,
                runId: run.id,
                stepKey: record.stepKey,
                error: getErrorMessage(error),
            });
            return {
                ...this.failure(
                    errorId,
                    RECORD_RETRY_OUTCOME.REPLAY_FAILED,
                    'Record replay failed',
                    record,
                    run.id,
                    definition,
                    adapterCode,
                ),
                appliedPatch: patchResult.appliedPatch,
            };
        }

        if (replayResult.failed > 0 || replayResult.succeeded === 0) {
            return {
                ...this.failure(
                    errorId,
                    RECORD_RETRY_OUTCOME.REPLAY_FAILED,
                    'Record replay completed without a successful side effect',
                    record,
                    run.id,
                    definition,
                    adapterCode,
                ),
                appliedPatch: patchResult.appliedPatch,
                ...replayResult,
            };
        }

        let auditId: ID | null = null;
        try {
            const audit = await this.retryAudits.record(
                ctx,
                record,
                payloadBefore,
                patchResult.appliedPatch,
                resultingPayload,
            );
            auditId = audit.id;
        } catch (error) {
            this.logger.warn('Record retry succeeded but audit recording failed', {
                errorId,
                runId: run.id,
                stepKey: record.stepKey,
                error: getErrorMessage(error),
            });
        }

        return {
            success: true,
            outcome: RECORD_RETRY_OUTCOME.APPLIED,
            message: auditId == null
                ? 'Record retry applied, but the audit entry could not be recorded'
                : 'Record retry applied',
            errorId,
            runId: run.id,
            stepKey: record.stepKey,
            adapterCode,
            definitionVersion: definition.version,
            appliedPatch: patchResult.appliedPatch,
            rejectedPatchKeys: [],
            ...replayResult,
            auditId,
            auditRecorded: auditId != null,
        };
    }

    private validatePatch(
        adapterCode: string | null,
        requestedPatch: JsonObject,
    ): {
        appliedPatch: JsonObject;
        rejectedPatchKeys: string[];
    } {
        const requestedEntries = Object.entries(requestedPatch);
        if (requestedEntries.length === 0) {
            return { appliedPatch: {}, rejectedPatchKeys: [] };
        }

        const adapter = adapterCode
            ? LOADER_ADAPTERS.find(candidate => candidate.code === adapterCode)
            : undefined;
        const allowedFields = new Set(adapter?.patchableFields ?? []);
        const allowAll = allowedFields.has('*');
        const rejectedPatchKeys = requestedEntries
            .filter(([key]) => !allowAll && !allowedFields.has(key))
            .map(([key]) => key);

        if (rejectedPatchKeys.length > 0) {
            return { appliedPatch: {}, rejectedPatchKeys };
        }

        return {
            appliedPatch: Object.fromEntries(requestedEntries) as JsonObject,
            rejectedPatchKeys: [],
        };
    }

    private failure(
        errorId: ID,
        outcome: Exclude<RecordRetryOutcome, 'APPLIED'>,
        message: string,
        record?: DataHubRecordError,
        runId: ID | null = null,
        definition?: PipelineDefinition,
        adapterCode: string | null = null,
    ): RecordRetryResult {
        return {
            success: false,
            outcome,
            message,
            errorId,
            runId,
            stepKey: record?.stepKey ?? null,
            adapterCode,
            definitionVersion: definition?.version ?? null,
            appliedPatch: {},
            rejectedPatchKeys: [],
            processed: 0,
            succeeded: 0,
            failed: 0,
            auditId: null,
            auditRecorded: false,
        };
    }
}
