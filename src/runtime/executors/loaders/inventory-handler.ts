/**
 * Inventory/Stock adjustment loader handler
 */
import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    ProductVariantService,
    StockLocationService,
    ProductVariant,
    ID,
} from '@vendure/core';
import { StockLevelInput, UpdateProductVariantInput } from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { findVariantBySku as findVariantBySkuLookup } from './shared-lookups';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';

/**
 * Configuration for the stock adjustment handler
 */
interface StockAdjustConfig {
    /** Field name containing the SKU identifier */
    skuField?: string;
    /** Field name containing the stock by location map */
    stockByLocationField?: string;
    /** Whether to set absolute stock levels (true) or adjust relative (false) */
    absolute?: boolean;
}

/**
 * Type guard to check if a value is a StockAdjustConfig
 */
function isStockAdjustConfig(value: unknown): value is StockAdjustConfig {
    if (value === null || typeof value !== 'object') return false;
    const config = value as Record<string, unknown>;
    return (
        (config.skuField === undefined || typeof config.skuField === 'string') &&
        (config.stockByLocationField === undefined || typeof config.stockByLocationField === 'string') &&
        (config.absolute === undefined || typeof config.absolute === 'boolean')
    );
}

/**
 * Type guard to check if a value is a Record<string, number> for stock levels
 */
function isStockByLocationMap(value: unknown): value is Record<string, number> {
    if (value === null || typeof value !== 'object') return false;
    return Object.entries(value as Record<string, unknown>).every(
        ([, v]) => typeof v === 'number'
    );
}

/**
 * Safely get a string or number property from a record
 */
function getRecordField(record: RecordObject, key: string): unknown {
    return record[key];
}

@Injectable()
export class StockAdjustHandler implements LoaderHandler {
    private readonly logger = new Logger(StockAdjustHandler.name);

    constructor(
        private productVariantService: ProductVariantService,
        private stockLocationService: StockLocationService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        // Parse and validate config
        const config: StockAdjustConfig = isStockAdjustConfig(step.config) ? step.config : {};
        const skuKey = config.skuField ?? 'sku';
        const stockMapKey = config.stockByLocationField ?? 'stockByLocation';
        const absolute = Boolean(config.absolute ?? false);

        for (const rec of input) {
            try {
                const skuValue = getRecordField(rec, skuKey);

                if (skuValue === undefined || skuValue === null) { fail++; continue; }
                const variant = await this.findVariantBySku(ctx, String(skuValue));
                if (!variant) { fail++; continue; }

                const mapValue = getRecordField(rec, stockMapKey);
                if (!isStockByLocationMap(mapValue)) { fail++; continue; }

                const levels = await this.resolveStockLevelsByCode(ctx, mapValue);
                if (!levels || !levels.length) { fail++; continue; }

                // Build update input with stock levels
                const stockLevels = levels.map(l => ({
                    ...l,
                    adjustmentStrategy: absolute ? 'SET' as const : 'ADJUST' as const,
                }));

                const update: UpdateProductVariantInput = {
                    id: variant.id,
                    stockLevels,
                };
                await this.productVariantService.update(ctx, [update]);
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'stockAdjust failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    private async findVariantBySku(ctx: RequestContext, sku: string): Promise<ProductVariant | undefined> {
        return findVariantBySkuLookup(this.productVariantService, ctx, sku);
    }

    private async resolveStockLevelsByCode(ctx: RequestContext, stockByLocation?: Record<string, number>): Promise<StockLevelInput[] | undefined> {
        if (!stockByLocation) return undefined;
        const result: StockLevelInput[] = [];
        for (const [locationName, qty] of Object.entries(stockByLocation)) {
            try {
                // StockLocation uses 'name' field, not 'code'
                const list = await this.stockLocationService.findAll(ctx, {
                    filter: { name: { eq: locationName } },
                    take: 1,
                });
                const stockLocation = list.items[0];
                if (stockLocation) {
                    result.push({
                        stockLocationId: stockLocation.id,
                        stockOnHand: Math.max(0, Math.floor(qty)),
                    });
                }
            } catch (error) {
                this.logger.warn(`Failed to lookup stock location '${locationName}': ${getErrorMessage(error)}`);
            }
        }
        return result;
    }
}
