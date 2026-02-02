import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    ProductVariantService,
    StockLocationService,
    StockLevelService,
    StockMovementService,
} from '@vendure/core';
import {
    EntityLoader,
    LoaderContext,
    EntityLoadResult,
    EntityValidationResult,
    EntityFieldSchema,
} from '../../types/index';
import { TargetOperation } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType } from '../../constants/enums';
import { InventoryInput, INVENTORY_LOADER_METADATA } from './types';
import { findVariantBySku, resolveStockLocationId, isRecoverableError } from './helpers';

@Injectable()
export class InventoryLoader implements EntityLoader<InventoryInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = INVENTORY_LOADER_METADATA.entityType;
    readonly name = INVENTORY_LOADER_METADATA.name;
    readonly description = INVENTORY_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...INVENTORY_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...INVENTORY_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...INVENTORY_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private productVariantService: ProductVariantService,
        private stockLocationService: StockLocationService,
        private stockLevelService: StockLevelService,
        private stockMovementService: StockMovementService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.INVENTORY_LOADER);
    }

    async load(context: LoaderContext, records: InventoryInput[]): Promise<EntityLoadResult> {
        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };

        const locationCache = new Map<string, ID>();

        for (const record of records) {
            try {
                const validation = await this.validate(context.ctx, record, context.operation);
                if (!validation.valid) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: validation.errors.map(e => e.message).join('; '),
                        recoverable: false,
                    });
                    continue;
                }

                const variant = await findVariantBySku(this.productVariantService, context.ctx, record.sku);
                if (!variant) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: `Product variant with SKU "${record.sku}" not found`,
                        code: 'NOT_FOUND',
                        recoverable: false,
                    });
                    continue;
                }

                const stockLocationId = await resolveStockLocationId(
                    this.stockLocationService,
                    context.ctx,
                    record,
                    locationCache,
                );

                if (!context.dryRun) {
                    await this.updateStockLevel(context.ctx, variant.id, record.stockOnHand, stockLocationId, record.reason);
                }

                result.updated++;
                result.succeeded++;
                result.affectedIds.push(variant.id);
            } catch (error) {
                result.failed++;
                result.errors.push({
                    record,
                    message: error instanceof Error ? error.message : String(error),
                    recoverable: isRecoverableError(error),
                });
                this.logger.error(`Failed to update inventory`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        _lookupFields: string[],
        record: InventoryInput,
    ): Promise<{ id: ID; entity: unknown } | null> {
        const variant = await findVariantBySku(this.productVariantService, ctx, record.sku);
        return variant ? { id: variant.id, entity: variant } : null;
    }

    async validate(
        _ctx: RequestContext,
        record: InventoryInput,
        _operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (!record.sku || typeof record.sku !== 'string' || record.sku.trim() === '') {
            errors.push({ field: 'sku', message: 'Product SKU is required', code: 'REQUIRED' });
        }

        if (record.stockOnHand === undefined || record.stockOnHand === null) {
            errors.push({ field: 'stockOnHand', message: 'Stock on hand is required', code: 'REQUIRED' });
        } else if (typeof record.stockOnHand !== 'number' || record.stockOnHand < 0) {
            errors.push({ field: 'stockOnHand', message: 'Stock on hand must be a non-negative number', code: 'INVALID_VALUE' });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.INVENTORY,
            fields: [
                {
                    key: 'sku',
                    label: 'Product SKU',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'SKU of the product variant to update',
                    example: 'PROD-001-BLK-M',
                },
                {
                    key: 'stockOnHand',
                    label: 'Stock On Hand',
                    type: 'number',
                    required: true,
                    description: 'New stock level (absolute value)',
                    example: 100,
                },
                {
                    key: 'stockLocationName',
                    label: 'Stock Location Name',
                    type: 'string',
                    description: 'Name of the stock location (uses default if not specified)',
                    example: 'Main Warehouse',
                },
                {
                    key: 'stockLocationId',
                    label: 'Stock Location ID',
                    type: 'string',
                    description: 'ID of the stock location (alternative to name)',
                },
                {
                    key: 'reason',
                    label: 'Adjustment Reason',
                    type: 'string',
                    description: 'Reason for the stock adjustment',
                    example: 'Inventory sync from ERP',
                },
            ],
        };
    }

    private async updateStockLevel(
        ctx: RequestContext,
        variantId: ID,
        newStockLevel: number,
        stockLocationId?: ID,
        _reason?: string,
    ): Promise<void> {
        const locations = await this.stockLocationService.findAll(ctx, {});
        const targetLocationId = stockLocationId || (locations.totalItems > 0 ? locations.items[0].id : undefined);

        if (!targetLocationId) {
            throw new Error('No stock location available');
        }

        await this.stockMovementService.adjustProductVariantStock(
            ctx,
            variantId,
            [{ stockLocationId: targetLocationId, stockOnHand: newStockLevel }],
        );
        this.logger.log(`Stock level set for variant ${variantId} to ${newStockLevel} at location ${targetLocationId}`);
    }
}
