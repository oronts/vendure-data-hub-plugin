import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ForbiddenError,
    ID,
    RequestContext,
    Transaction,
    TransactionalConnection,
} from '@vendure/core';
import type { JsonObject, PipelineDefinition } from '../../types/index';
import { LOGGER_CONTEXTS } from '../../constants';
import {
    ReplayDataHubRecordPermission,
    ViewDataHubQuarantinePermission,
    EditDataHubQuarantinePermission,
} from '../../permissions';
import { RecordErrorService, RecordRetryAuditService, RecordRetryService, type RecordRetryResult } from '../../services';
import { PipelineRun } from '../../entities/pipeline';
import { DataHubRecordRetryAudit } from '../../entities/data';
import { deepClone } from '../../utils';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { getErrorMessage } from '../../utils/error.utils';
import type { RecordErrorPage } from '../../services/data/record-error-page';

/** Extended pipeline definition that may include security settings */
interface PipelineDefinitionWithSecurity extends PipelineDefinition {
    security?: {
        maskFields?: string[];
    };
}

@Resolver()
export class DataHubErrorAdminResolver {
    private readonly logger: DataHubLogger;

    constructor(
        private recordErrors: RecordErrorService,
        private recordRetry: RecordRetryService,
        private connection: TransactionalConnection,
        private retryAudits: RecordRetryAuditService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ERROR_RESOLVER);
    }

    @Query()
    @Allow(ViewDataHubQuarantinePermission.Permission)
    async dataHubRunErrors(
        @Ctx() ctx: RequestContext,
        @Args() args: { runId: ID; first?: number; after?: string },
    ): Promise<RecordErrorPage> {
        const page = await this.recordErrors.listByRun(ctx, args.runId, args);
        const maskFields = await this.getMaskFieldsForRun(ctx, args.runId);
        if (maskFields === null) {
            return { ...page, items: page.items.map(item => ({ ...item, payload: {} })) };
        }
        if (maskFields.length) {
            return {
                ...page,
                items: page.items.map(item => ({
                    ...item,
                    payload: this.maskPayload(item.payload, maskFields),
                })),
            };
        }
        return page;
    }

    private async getMaskFieldsForRun(ctx: RequestContext, runId: ID): Promise<string[] | null> {
        try {
            const runRepo = this.connection.getRepository(ctx, PipelineRun);
            const run = await runRepo.findOne({ where: { id: runId }, relations: { pipeline: true } });
            if (!run?.pipeline) {
                this.logger.error(`Cannot resolve masking policy for run ${runId}`);
                return null;
            }
            const definition = (run.definitionSnapshot ?? run.pipeline.definition) as
                PipelineDefinitionWithSecurity | undefined;
            return this.extractMaskFields(definition);
        } catch (error) {
            this.logger.error(
                `Failed to retrieve mask fields for run ${runId}`,
                new Error(getErrorMessage(error)),
            );
            return null;
        }
    }

    private extractMaskFields(definition: PipelineDefinitionWithSecurity | undefined): string[] {
        const maskFields = definition?.security?.maskFields;
        return Array.isArray(maskFields) ? maskFields : [];
    }

    @Query()
    @Allow(ViewDataHubQuarantinePermission.Permission)
    async dataHubRecordRetryAudits(
        @Ctx() ctx: RequestContext,
        @Args() args: { errorId: ID; limit?: number },
    ): Promise<DataHubRecordRetryAudit[]> {
        const rows = await this.retryAudits.listByError(ctx, args.errorId, args.limit);
        if (rows.length === 0) return rows;

        // Pre-load mask fields once for all rows since they share the same error/run/pipeline
        const maskFields = await this.getMaskFieldsForError(ctx, args.errorId);
        if (maskFields === null) {
            return rows.map(row => ({
                ...row,
                previousPayload: {},
                patch: {},
                resultingPayload: {},
            }));
        }
        if (maskFields.length) {
            return rows.map(r => ({
                ...r,
                previousPayload: this.maskPayload(r.previousPayload, maskFields),
                patch: this.maskPayload(r.patch, maskFields),
                resultingPayload: this.maskPayload(r.resultingPayload, maskFields),
            }));
        }
        return rows;
    }

    private async getMaskFieldsForError(ctx: RequestContext, errorId: ID): Promise<string[] | null> {
        try {
            const err = await this.recordErrors.getById(ctx, errorId);
            const runId = err?.runId ?? err?.run?.id;
            if (!runId) {
                this.logger.error(`Cannot resolve masking policy for error ${errorId}`);
                return null;
            }
            return this.getMaskFieldsForRun(ctx, runId);
        } catch (error) {
            this.logger.error(
                `Failed to retrieve error record ${errorId} for mask fields lookup`,
                new Error(getErrorMessage(error)),
            );
            return null;
        }
    }

    @Query()
    @Allow(ViewDataHubQuarantinePermission.Permission)
    async dataHubDeadLetters(
        @Ctx() ctx: RequestContext,
        @Args() args: { first?: number; after?: string },
    ): Promise<RecordErrorPage> {
        const page = await this.recordErrors.listDeadLetters(ctx, args);
        if (page.items.length === 0) return page;

        // Pre-load pipeline settings for all unique pipeline IDs to avoid N+1
        const uniqueRunIds = [...new Set(page.items.map(it => it.runId ?? it.run?.id).filter(Boolean))];
        const maskFieldsMap = await this.getMaskFieldsMapForRuns(ctx, uniqueRunIds);

        const items = page.items.map(it => {
            const runId = it.runId ?? it.run?.id;
            const maskFields = runId ? maskFieldsMap.get(runId) ?? null : null;
            if (maskFields === null) {
                return { ...it, payload: {} };
            }
            if (maskFields.length) {
                return { ...it, payload: this.maskPayload(it.payload, maskFields) };
            }
            return it;
        });
        return { ...page, items };
    }

    private async getMaskFieldsMapForRuns(
        ctx: RequestContext,
        runIds: ID[],
    ): Promise<Map<ID, string[] | null>> {
        const map = new Map<ID, string[] | null>(runIds.map(id => [id, null]));
        if (runIds.length === 0) return map;

        try {
            const runRepo = this.connection.getRepository(ctx, PipelineRun);
            const runs = await runRepo.find({
                where: runIds.map(id => ({ id })),
                relations: { pipeline: true },
            });

            for (const run of runs) {
                const definition = (run.definitionSnapshot ?? run.pipeline?.definition) as
                    PipelineDefinitionWithSecurity | undefined;
                const maskFields = this.extractMaskFields(definition);
                map.set(run.id, maskFields);
            }
        } catch (error) {
            this.logger.error(
                'Failed to batch-retrieve mask fields for runs',
                new Error(getErrorMessage(error)),
            );
        }

        return map;
    }

    @Mutation()
    @Transaction()
    @Allow(ReplayDataHubRecordPermission.Permission)
    async retryDataHubRecord(
        @Ctx() ctx: RequestContext,
        @Args() args: { errorId: ID; patch?: JsonObject },
    ): Promise<RecordRetryResult> {
        const patch = args.patch ?? {};
        if (
            Object.keys(patch).length > 0 &&
            !ctx.userHasPermissions([EditDataHubQuarantinePermission.Permission])
        ) {
            throw new ForbiddenError();
        }
        return this.recordRetry.retry(ctx, args.errorId, patch);
    }

    @Mutation()
    @Transaction()
    @Allow(EditDataHubQuarantinePermission.Permission)
    async markDataHubDeadLetter(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID; deadLetter: boolean },
    ): Promise<boolean> {
        return this.recordErrors.markDeadLetter(ctx, args.id, args.deadLetter);
    }

    private maskPayload(payload: JsonObject, paths: string[]): JsonObject {
        const clone = deepClone(payload ?? {}) as JsonObject;
        for (const p of paths) {
            const parts = String(p).split('.');
            let cur: JsonObject = clone;
            for (let i = 0; i < parts.length - 1; i++) {
                if (cur == null) break;
                const next = cur[parts[i]];
                if (typeof next !== 'object' || next === null || Array.isArray(next)) break;
                cur = next as JsonObject;
            }
            if (cur) cur[parts[parts.length - 1]] = '***';
        }
        return clone;
    }

}
