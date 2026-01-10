/**
 * Promotion upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    PromotionService,
    RequestContextService,
} from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { safeJson } from '../../utils';
import { LoaderHandler } from './types';

@Injectable()
export class PromotionHandler implements LoaderHandler {
    constructor(
        private promotionService: PromotionService,
        private requestContextService: RequestContextService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        for (const rec of input) {
            try {
                const code = String((rec as any)?.[(step.config as any)?.codeField ?? 'code'] ?? '') || undefined;
                if (!code) { fail++; continue; }

                const enabledVal = (rec as any)?.[(step.config as any)?.enabledField ?? 'enabled'];
                const enabled = typeof enabledVal === 'boolean' ? enabledVal : String(enabledVal).toLowerCase() === 'true';
                const name = String((rec as any)?.[(step.config as any)?.nameField ?? 'name'] ?? code);
                const startsAtRaw = (rec as any)?.[(step.config as any)?.startsAtField ?? 'startsAt'];
                const endsAtRaw = (rec as any)?.[(step.config as any)?.endsAtField ?? 'endsAt'];
                const conditionsJsonField = (step.config as any)?.conditionsField;
                const actionsJsonField = (step.config as any)?.actionsField;
                const conditions = conditionsJsonField ? (safeJson((rec as any)?.[conditionsJsonField]) ?? []) : [];
                const actions = actionsJsonField ? (safeJson((rec as any)?.[actionsJsonField]) ?? []) : [];
                const startsAt = startsAtRaw ? new Date(startsAtRaw) : undefined;
                const endsAt = endsAtRaw ? new Date(endsAtRaw) : undefined;

                // Find by code
                const list = await this.promotionService.findAll(ctx, { filter: { couponCode: { eq: code } }, take: 1 } as any);
                const existing = list.items[0] as any;
                const channel = (step.config as any)?.channel as string | undefined;
                let opCtx = ctx;
                if (channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType as any, channelOrToken: channel });
                    if (req) opCtx = req;
                }

                if (existing) {
                    const updated = await this.promotionService.updatePromotion(opCtx, {
                        id: existing.id,
                        enabled,
                        startsAt,
                        endsAt,
                        name,
                        couponCode: code,
                        conditions,
                        actions,
                    } as any);
                    if (channel) {
                        try {
                            await this.promotionService.assignPromotionsToChannel(opCtx, { promotionIds: [(updated as any).id], channelId: opCtx.channelId as any } as any);
                        } catch {}
                    }
                } else {
                    const created = await this.promotionService.createPromotion(opCtx, {
                        enabled,
                        startsAt,
                        endsAt,
                        name,
                        couponCode: code,
                        conditions,
                        actions,
                    } as any);
                    if (channel) {
                        try {
                            await this.promotionService.assignPromotionsToChannel(opCtx, { promotionIds: [(created as any).id], channelId: opCtx.channelId as any } as any);
                        } catch {}
                    }
                }
                ok++;
            } catch (e: any) {
                if (onRecordError) await onRecordError(step.key, e?.message ?? 'promotionUpsert failed', rec as any);
                fail++;
            }
        }
        return { ok, fail };
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, any>> {
        let exists = 0, missing = 0;
        for (const rec of input) {
            const code = String((rec as any)?.[(step.config as any)?.codeField ?? 'code'] ?? '') || undefined;
            if (!code) continue;
            const list = await this.promotionService.findAll(ctx, { filter: { couponCode: { eq: code } }, take: 1 } as any);
            if (list.items[0]) exists++; else missing++;
        }
        return { exists, missing };
    }
}
