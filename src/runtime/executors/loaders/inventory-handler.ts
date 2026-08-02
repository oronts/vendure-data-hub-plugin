/**
 * Inventory/Stock adjustment loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    ProductVariantService,
    StockLocationService,
    StockLevelService,
    StockMovementService,
    ProductVariant,
} from '@vendure/core';
import { StockLevelInput } from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { findVariantBySku as findVariantBySkuLookup } from './shared-lookups';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getStringValue } from '../../../loaders/shared-helpers';
import { DistributedLockService } from '../../../services/runtime/distributed-lock.service';

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

function isStockAdjustConfig(value: unknown): value is StockAdjustConfig {
    if (value === null || typeof value !== 'object') return false;
    const config = value as Record<string, unknown>;
    return (
        (config.skuField === undefined || typeof config.skuField === 'string') &&
        (config.stockByLocationField === undefined || typeof config.stockByLocationField === 'string') &&
        (config.absolute === undefined || typeof config.absolute === 'boolean')
    );
}

function isStockByLocationMap(value: unknown): value is Record<string, number> {
    if (value === null || typeof value !== 'object') return false;
    return Object.entries(value as Record<string, unknown>).every(
        ([name, quantity]) => name.trim() !== ''
            && typeof quantity === 'number'
            && Number.isInteger(quantity),
    );
}

@Injectable()
export class StockAdjustHandler implements LoaderHandler {
    constructor(
        private productVariantService: ProductVariantService,
        private stockLocationService: StockLocationService,
        private stockLevelService: StockLevelService,
        private stockMovementService: StockMovementService,
        private distributedLock: DistributedLockService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0, fail = 0;

        // Parse and validate config
        if (!isStockAdjustConfig(step.config)) {
            throw new Error('Invalid stockAdjust configuration');
        }
        const config: StockAdjustConfig = step.config;
        const skuKey = config.skuField ?? 'sku';
        const stockMapKey = config.stockByLocationField ?? 'stockByLocation';
        const absolute = config.absolute ?? true;

        for (const rec of input) {
            try {
                const sku = getStringValue(rec, skuKey);

                if (!sku) {
                    if (onRecordError) {
                        await onRecordError(step.key, `Missing required SKU field "${skuKey}"`, rec);
                    }
                    fail++;
                    continue;
                }

                const mapValue = rec[stockMapKey];
                if (!isStockByLocationMap(mapValue)) {
                    if (onRecordError) {
                        await onRecordError(step.key, `Invalid or missing stock-by-location map in field "${stockMapKey}" for SKU "${sku}"`, rec);
                    }
                    fail++;
                    continue;
                }

                const variant = await this.findVariantBySku(ctx, sku);
                if (!variant) {
                    if (onRecordError) {
                        await onRecordError(step.key, `Variant not found for SKU "${sku}"`, rec);
                    }
                    fail++;
                    continue;
                }

                const stockLevels = await this.resolveStockLevelsByName(ctx, mapValue);
                await this.applyStockLevels(ctx, variant.id, stockLevels, absolute);
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'stockAdjust failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail, skipped: 0 };
    }

    private async findVariantBySku(ctx: RequestContext, sku: string): Promise<ProductVariant | undefined> {
        return findVariantBySkuLookup(this.productVariantService, ctx, sku);
    }

    private async resolveStockLevelsByName(
        ctx: RequestContext,
        stockByLocation: Record<string, number>,
    ): Promise<StockLevelInput[]> {
        if (Object.keys(stockByLocation).length === 0) {
            throw new Error('Stock-by-location map must not be empty');
        }
        const result: StockLevelInput[] = [];
        for (const [locationName, quantity] of Object.entries(stockByLocation)) {
            const list = await this.stockLocationService.findAll(ctx, {
                filter: { name: { eq: locationName } },
                take: 2,
            });
            if (list.items.length !== 1) {
                const reason = list.items.length === 0 ? 'was not found' : 'is ambiguous';
                throw new Error(`Stock location name "${locationName}" ${reason} in the active channel`);
            }
            result.push({
                stockLocationId: list.items[0].id,
                stockOnHand: Math.trunc(quantity),
            });
        }
        return result;
    }

    private async applyStockLevels(
        ctx: RequestContext,
        variantId: ID,
        stockLevels: StockLevelInput[],
        absolute: boolean,
    ): Promise<void> {
        if (absolute) {
            if (stockLevels.some(level => level.stockOnHand < 0)) {
                throw new Error('Absolute stock levels must be non-negative');
            }
            await this.stockMovementService.adjustProductVariantStock(ctx, variantId, stockLevels);
            return;
        }

        const lockKey = `stock-adjust:${String(ctx.channelId)}:${String(variantId)}`;
        await this.distributedLock.withLock(lockKey, async () => {
            const updatedLevels = await Promise.all(stockLevels.map(async level => {
                const current = await this.stockLevelService.getStockLevel(
                    ctx,
                    variantId,
                    level.stockLocationId,
                );
                return {
                    stockLocationId: level.stockLocationId,
                    stockOnHand: current.stockOnHand + level.stockOnHand,
                };
            }));
            await this.stockMovementService.adjustProductVariantStock(ctx, variantId, updatedLevels);
        });
    }
}
