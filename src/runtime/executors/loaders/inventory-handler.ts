/**
 * Inventory/Stock adjustment loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ProductVariantService,
    ListQueryOptions,
    StockLocationService,
} from '@vendure/core';
import { StockLevelInput, UpdateProductVariantInput } from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';

@Injectable()
export class StockAdjustHandler implements LoaderHandler {
    constructor(
        private productVariantService: ProductVariantService,
        private stockLocationService: StockLocationService,
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
                const skuKey = (step.config as any)?.skuField ?? 'sku';
                const stockMapKey = (step.config as any)?.stockByLocationField ?? 'stockByLocation';
                const absolute = Boolean((step.config as any)?.absolute ?? false);
                const sku = (rec as any)?.[skuKey];

                if (!sku) { fail++; continue; }
                const variant = await this.findVariantBySku(ctx, String(sku));
                if (!variant) { fail++; continue; }

                const map = (rec as any)?.[stockMapKey] as Record<string, number> | undefined;
                if (!map) { fail++; continue; }

                const levels = await this.resolveStockLevelsByCode(ctx, map);
                if (!levels || !levels.length) { fail++; continue; }

                const update: UpdateProductVariantInput = { id: variant.id as any } as any;
                (update as any).stockLevels = levels.map(l => ({ ...l, adjustmentStrategy: absolute ? 'SET' : 'ADJUST' } as any)) as any;
                await this.productVariantService.update(ctx, [update] as any);
                ok++;
            } catch (e: any) {
                if (onRecordError) {
                    await onRecordError(step.key, e?.message ?? 'stockAdjust failed', rec as any);
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    private async findVariantBySku(ctx: RequestContext, sku: string) {
        const result = await this.productVariantService.findAll(ctx, { filter: { sku: { eq: sku } } } as unknown as ListQueryOptions<any>);
        return result.items[0];
    }

    private async resolveStockLevelsByCode(ctx: RequestContext, stockByLocation?: Record<string, number>): Promise<StockLevelInput[] | undefined> {
        if (!stockByLocation) return undefined;
        const result: StockLevelInput[] = [];
        for (const [code, qty] of Object.entries(stockByLocation)) {
            try {
                const list = await this.stockLocationService.findAll(ctx, { filter: { code: { eq: code } }, take: 1 } as any);
                const id = (list.items[0]?.id as any) ?? undefined;
                if (id) {
                    result.push({ stockLocationId: id as any, stockOnHand: Math.max(0, Math.floor(qty)) });
                }
            } catch { /* skip */ }
        }
        return result;
    }
}
