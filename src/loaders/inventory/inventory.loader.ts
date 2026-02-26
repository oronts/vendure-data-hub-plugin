import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    ProductVariantService,
    StockLocationService,
    StockLevelService,
    StockMovementService,
    ProductVariant,
} from '@vendure/core';
import {
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType } from '../../constants/enums';
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderMetadata,
    ValidationBuilder,
} from '../base';
import { InventoryInput, INVENTORY_LOADER_METADATA } from './types';
import { findVariantBySku, resolveStockLocationId } from './helpers';

/**
 * Inventory Loader - Refactored to extend BaseEntityLoader
 *
 * Updates stock levels for product variants by SKU.
 *
 * Note: This loader only supports UPDATE and UPSERT operations.
 * It cannot CREATE variants - if a variant doesn't exist by SKU,
 * the record will fail (UPSERT) or be skipped (UPDATE).
 */
@Injectable()
export class InventoryLoader extends BaseEntityLoader<InventoryInput, ProductVariant> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = INVENTORY_LOADER_METADATA;

    // Cache for resolved stock location IDs
    private locationCache = new Map<string, ID>();

    constructor(
        private connection: TransactionalConnection,
        private productVariantService: ProductVariantService,
        private stockLocationService: StockLocationService,
        private stockLevelService: StockLevelService,
        private stockMovementService: StockMovementService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.INVENTORY_LOADER);
    }

    protected getDuplicateErrorMessage(record: InventoryInput): string {
        // This shouldn't be called since we only support UPDATE/UPSERT, not CREATE
        return `Inventory record for SKU "${record.sku}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        _lookupFields: string[],
        record: InventoryInput,
    ): Promise<ExistingEntityLookupResult<ProductVariant> | null> {
        const variant = await findVariantBySku(this.productVariantService, ctx, record.sku);
        if (variant) {
            // We need to get the full variant to satisfy the type
            const fullVariant = await this.productVariantService.findOne(ctx, variant.id);
            if (fullVariant) {
                return { id: variant.id, entity: fullVariant };
            }
        }
        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: InventoryInput,
        _operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        return new ValidationBuilder()
            .requireString('sku', record.sku, 'Product SKU is required')
            .requirePositiveNumber('stockOnHand', record.stockOnHand, 'Stock on hand must be a non-negative number')
            .build();
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

    /**
     * This loader cannot create variants - only update stock levels.
     * If UPSERT operation is used and variant doesn't exist, this will fail.
     */
    protected async createEntity(_context: LoaderContext, record: InventoryInput): Promise<ID | null> {
        throw new Error(`Cannot adjust inventory for non-existent SKU "${record.sku}". Variant must exist before stock can be adjusted.`);
    }

    protected async updateEntity(context: LoaderContext, variantId: ID, record: InventoryInput): Promise<void> {
        const { ctx } = context;

        const stockLocationId = await resolveStockLocationId(
            this.stockLocationService,
            ctx,
            record,
            this.locationCache,
        );

        const locations = await this.stockLocationService.findAll(ctx, {});
        const targetLocationId = stockLocationId || (locations.totalItems > 0 ? locations.items[0].id : undefined);

        if (!targetLocationId) {
            throw new Error(`No stock location available for SKU "${record.sku}" (variant ${variantId}). Create a stock location first.`);
        }

        await this.stockMovementService.adjustProductVariantStock(
            ctx,
            variantId,
            [{ stockLocationId: targetLocationId, stockOnHand: record.stockOnHand }],
        );

        this.logger.log(`Stock level set for variant ${variantId} to ${record.stockOnHand} at location ${targetLocationId}`);
    }
}
