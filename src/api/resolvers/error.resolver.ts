import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext, Transaction, TransactionalConnection } from '@vendure/core';
import type { JsonObject, PipelineStepDefinition, PipelineDefinition } from '../../types/index';
import { LOGGER_CONTEXTS } from '../../constants';
import { StepType } from '../../constants/enums';
import {
    ReplayDataHubRecordPermission,
    ViewDataHubQuarantinePermission,
    EditDataHubQuarantinePermission,
} from '../../permissions';
import { RecordErrorService, RecordRetryAuditService, ErrorReplayService } from '../../services';
import { PipelineRun, Pipeline } from '../../entities/pipeline';
import { DataHubRecordRetryAudit, DataHubRecordError } from '../../entities/data';
import { deepClone } from '../../utils';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { getErrorMessage } from '../../utils/error.utils';

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
        private errorReplay: ErrorReplayService,
        private connection: TransactionalConnection,
        private retryAudits: RecordRetryAuditService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ERROR_RESOLVER);
    }

    @Query()
    @Allow(ViewDataHubQuarantinePermission.Permission)
    async dataHubRunErrors(@Ctx() ctx: RequestContext, @Args() args: { runId: ID }): Promise<DataHubRecordError[]> {
        const items = await this.recordErrors.listByRun(ctx, args.runId);
        const maskFields = await this.getMaskFieldsForRun(ctx, args.runId);
        if (maskFields.length) {
            return items.map(it => ({ ...it, payload: this.maskPayload(it.payload, maskFields) }));
        }
        return items;
    }

    private async getMaskFieldsForRun(ctx: RequestContext, runId: ID): Promise<string[]> {
        try {
            const runRepo = this.connection.getRepository(ctx, PipelineRun);
            const run = await runRepo.findOne({ where: { id: runId }, relations: { pipeline: true } });
            const definition = run?.pipeline?.definition as PipelineDefinitionWithSecurity | undefined;
            return this.extractMaskFields(definition);
        } catch (error) {
            this.logger.debug(`Failed to retrieve mask fields for run ${runId}`, { error });
            return [];
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
        @Args() args: { errorId: ID },
    ): Promise<DataHubRecordRetryAudit[]> {
        const rows = await this.retryAudits.listByError(ctx, args.errorId);
        if (rows.length === 0) return rows;

        // Pre-load mask fields once for all rows since they share the same error/run/pipeline
        const maskFields = await this.getMaskFieldsForError(ctx, args.errorId);
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

    private async getMaskFieldsForError(ctx: RequestContext, errorId: ID): Promise<string[]> {
        try {
            const err = await this.recordErrors.getById(ctx, errorId);
            if (!err) return [];
            return this.getMaskFieldsForRun(ctx, err.runId ?? err.run?.id);
        } catch (error) {
            this.logger.debug(`Failed to retrieve error record ${errorId} for mask fields lookup`, { error });
            return [];
        }
    }

    @Query()
    @Allow(ViewDataHubQuarantinePermission.Permission)
    async dataHubDeadLetters(@Ctx() ctx: RequestContext): Promise<DataHubRecordError[]> {
        const items = await this.recordErrors.listDeadLetters(ctx);
        if (items.length === 0) return items;

        // Pre-load pipeline settings for all unique pipeline IDs to avoid N+1
        const uniqueRunIds = [...new Set(items.map(it => it.runId ?? it.run?.id).filter(Boolean))];
        const maskFieldsMap = await this.getMaskFieldsMapForRuns(ctx, uniqueRunIds);

        return items.map(it => {
            const runId = it.runId ?? it.run?.id;
            const maskFields = runId ? maskFieldsMap.get(runId) ?? [] : [];
            if (maskFields.length) {
                return { ...it, payload: this.maskPayload(it.payload, maskFields) };
            }
            return it;
        });
    }

    private async getMaskFieldsMapForRuns(ctx: RequestContext, runIds: ID[]): Promise<Map<ID, string[]>> {
        const map = new Map<ID, string[]>();
        if (runIds.length === 0) return map;

        try {
            const runRepo = this.connection.getRepository(ctx, PipelineRun);
            const runs = await runRepo.find({
                where: runIds.map(id => ({ id })),
                relations: { pipeline: true },
            });

            for (const run of runs) {
                const definition = run?.pipeline?.definition as PipelineDefinitionWithSecurity | undefined;
                const maskFields = this.extractMaskFields(definition);
                map.set(run.id, maskFields);
            }
        } catch (error) {
            this.logger.debug(`Failed to batch-retrieve mask fields for runs`, { error });
        }

        return map;
    }

    @Mutation()
    @Transaction()
    @Allow(ReplayDataHubRecordPermission.Permission)
    async retryDataHubRecord(
        @Ctx() ctx: RequestContext,
        @Args() args: { errorId: ID; patch?: JsonObject },
    ): Promise<boolean> {
        const rec = await this.recordErrors.getById(ctx, args.errorId);
        if (!rec) return false;

        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const run = await runRepo.findOne({ where: { id: rec.run.id }, relations: { pipeline: true } });
        if (!run?.pipeline?.id) return false;

        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, run.pipeline.id);
        const payloadBefore: JsonObject = rec.payload ?? {};
        const patch: JsonObject = args.patch ?? {};

        // Restrict patch to allowed keys for this loader/step
        const step = (pipeline.definition?.steps ?? []).find(s => s.key === rec.stepKey);
        const allowed = this.getAllowedPatchKeysForStep(step);
        const cleanPatch: JsonObject = {};
        for (const [k, v] of Object.entries(patch)) {
            if (allowed.has(k)) cleanPatch[k] = v;
        }
        const payload: JsonObject = { ...payloadBefore, ...cleanPatch };

        await this.errorReplay.replayRecord(ctx, pipeline.definition, rec.stepKey, payload);

        await this.retryAudits.record(ctx, rec, payloadBefore, cleanPatch, payload).catch((err: unknown) => {
            this.logger.warn(`Failed to record retry audit for record ${args.errorId}`, { error: getErrorMessage(err) });
        });

        return true;
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

    private getAllowedPatchKeysForStep(step: PipelineStepDefinition | undefined): Set<string> {
        const keys = new Set<string>();
        if (!step || step.type !== StepType.LOAD) return keys;

        const code = (step.config as JsonObject)?.adapterCode as string | undefined;
        switch (code) {
            case 'productUpsert':
                ['slug', 'name', 'description', 'sku', 'price', 'priceByCurrency', 'stockOnHand', 'trackInventory']
                    .forEach(k => keys.add(k));
                break;
            case 'variantUpsert':
                ['sku', 'name', 'price', 'priceByCurrency', 'stockOnHand']
                    .forEach(k => keys.add(k));
                break;
            case 'customerUpsert':
                ['email', 'firstName', 'lastName', 'phoneNumber']
                    .forEach(k => keys.add(k));
                break;
            case 'collectionUpsert':
                ['slug', 'name', 'description', 'parentSlug']
                    .forEach(k => keys.add(k));
                break;
            case 'promotionUpsert':
                ['code', 'name', 'enabled', 'startsAt', 'endsAt']
                    .forEach(k => keys.add(k));
                break;
            case 'stockAdjust':
                ['sku', 'stockByLocation']
                    .forEach(k => keys.add(k));
                break;
            case 'orderNote':
                ['orderId', 'orderCode', 'note', 'isPrivate']
                    .forEach(k => keys.add(k));
                break;
            case 'applyCoupon':
                ['orderId', 'orderCode', 'coupon']
                    .forEach(k => keys.add(k));
                break;
            default:
                break;
        }
        return keys;
    }
}
