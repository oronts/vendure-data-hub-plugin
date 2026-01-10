import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext } from '@vendure/core';
import {
    ReplayRecordPermission,
    ViewQuarantinePermission,
    EditQuarantinePermission,
} from '../../permissions';
import { RecordErrorService, RecordRetryAuditService } from '../../services';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { TransactionalConnection } from '@vendure/core';
import { PipelineRun, Pipeline } from '../../entities/pipeline';
import { DataHubRecordRetryAudit } from '../../entities/data';
import { deepClone } from '../../runtime/utils';

@Resolver()
export class DataHubErrorAdminResolver {
    constructor(
        private recordErrors: RecordErrorService,
        private adapterRuntime: AdapterRuntimeService,
        private connection: TransactionalConnection,
        private retryAudits: RecordRetryAuditService,
    ) {}

    // ERROR QUERIES

    @Query()
    @Allow(ViewQuarantinePermission.Permission)
    async dataHubRunErrors(@Ctx() ctx: RequestContext, @Args() args: { runId: ID }) {
        const items = await this.recordErrors.listByRun(ctx, args.runId);
        // PII masking: mask fields declared in pipeline.definition.security.maskFields
        try {
            const runRepo = this.connection.getRepository(ctx, PipelineRun);
            const run = await runRepo.findOne({ where: { id: args.runId }, relations: { pipeline: true } });
            const maskFields: string[] = Array.isArray(((run as any)?.pipeline?.definition as any)?.security?.maskFields)
                ? ((run as any)?.pipeline?.definition as any)?.security?.maskFields
                : [];
            if (maskFields.length) {
                return items.map(it => ({ ...it, payload: this.maskPayload(it.payload, maskFields) }));
            }
        } catch {
            // Continue without masking if there's an error
        }
        return items;
    }

    @Query()
    @Allow(ViewQuarantinePermission.Permission)
    dataHubRecordRetryAudits(
        @Ctx() ctx: RequestContext,
        @Args() args: { errorId: ID },
    ): Promise<DataHubRecordRetryAudit[]> {
        return (async () => {
            const rows = await this.retryAudits.listByError(ctx, args.errorId);
            try {
                const err = await this.recordErrors.getById(ctx, args.errorId);
                if (!err) return rows;
                const run = await this.connection.getRepository(ctx, PipelineRun).findOne({
                    where: { id: (err as any).run?.id },
                    relations: { pipeline: true },
                });
                const maskFields: string[] = Array.isArray(((run as any)?.pipeline?.definition as any)?.security?.maskFields)
                    ? ((run as any)?.pipeline?.definition as any)?.security?.maskFields
                    : [];
                if (maskFields.length) {
                    return rows.map(r => ({
                        ...r,
                        previousPayload: this.maskPayload(r.previousPayload, maskFields),
                        patch: this.maskPayload(r.patch, maskFields),
                        resultingPayload: this.maskPayload(r.resultingPayload, maskFields),
                    })) as any;
                }
            } catch {
                // Continue without masking if there's an error
            }
            return rows;
        })();
    }

    @Query()
    @Allow(ViewQuarantinePermission.Permission)
    dataHubDeadLetters(@Ctx() ctx: RequestContext): Promise<Array<{ id: ID; stepKey: string; message: string; payload: any }>> {
        return this.recordErrors.listDeadLetters(ctx);
    }

    // ERROR MUTATIONS

    @Mutation()
    @Allow(ReplayRecordPermission.Permission)
    async retryDataHubRecord(
        @Ctx() ctx: RequestContext,
        @Args() args: { errorId: ID; patch?: any },
    ): Promise<boolean> {
        const rec = await this.recordErrors.getById(ctx, args.errorId);
        if (!rec) return false;

        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const run = await runRepo.findOne({ where: { id: rec.run.id }, relations: { pipeline: true } });
        if (!run?.pipeline?.id) return false;

        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, run.pipeline.id);
        const payloadBefore = rec.payload ?? {};
        const patch = args.patch ?? {};

        // Restrict patch to allowed keys for this loader/step
        const step = (pipeline.definition?.steps ?? []).find(s => s.key === rec.stepKey);
        const allowed = this.getAllowedPatchKeysForStep(step);
        const cleanPatch: any = {};
        for (const [k, v] of Object.entries(patch)) {
            if (allowed.has(k)) cleanPatch[k] = v;
        }
        const payload = { ...payloadBefore, ...cleanPatch };

        // Replay starting after the error step to continue processing downstream
        await this.adapterRuntime.replayFromStep(
            ctx,
            pipeline.definition,
            rec.stepKey,
            [payload],
            undefined,
            async () => { /* suppress */ },
        );

        try {
            await this.retryAudits.record(ctx, rec as any, payloadBefore, cleanPatch, payload);
        } catch {
            // Non-fatal error
        }

        return true;
    }

    @Mutation()
    @Allow(EditQuarantinePermission.Permission)
    async markDataHubDeadLetter(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID; deadLetter: boolean },
    ): Promise<boolean> {
        return this.recordErrors.markDeadLetter(ctx, args.id, args.deadLetter);
    }

    // HELPER METHODS

    private maskPayload(payload: any, paths: string[]): any {
        const clone = deepClone(payload ?? {});
        for (const p of paths) {
            try {
                const parts = String(p).split('.');
                let cur: any = clone;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (cur == null) break;
                    cur = cur[parts[i]];
                }
                if (cur) cur[parts[parts.length - 1]] = '***';
            } catch {
                // Continue masking other fields
            }
        }
        return clone;
    }

    private getAllowedPatchKeysForStep(step: any): Set<string> {
        const keys = new Set<string>();
        if (!step || step.type !== 'LOAD') return keys;

        const code = (step.config as any)?.adapterCode as string | undefined;
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
