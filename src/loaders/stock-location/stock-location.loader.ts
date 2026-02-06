import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    StockLocationService,
    StockLocation,
} from '@vendure/core';
import {
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import { BaseEntityLoader, ExistingEntityLookupResult, LoaderMetadata } from '../base';
import { StockLocationInput, STOCK_LOCATION_LOADER_METADATA } from './types';
import { shouldUpdateField } from '../shared-helpers';

/**
 * StockLocationLoader - Refactored to extend BaseEntityLoader
 *
 * This eliminates ~60 lines of duplicate load() method code that was
 * copy-pasted across all loaders. The base class handles:
 * - Result initialization
 * - Validation loop
 * - Duplicate detection
 * - CREATE/UPDATE/UPSERT operation logic
 * - Dry run mode
 * - Error handling
 */
@Injectable()
export class StockLocationLoader extends BaseEntityLoader<StockLocationInput, StockLocation> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = STOCK_LOCATION_LOADER_METADATA;

    constructor(
        private connection: TransactionalConnection,
        private stockLocationService: StockLocationService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.STOCK_LOCATION_LOADER);
    }

    protected getDuplicateErrorMessage(record: StockLocationInput): string {
        return `Stock location "${record.name}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: StockLocationInput,
    ): Promise<ExistingEntityLookupResult<StockLocation> | null> {
        // Primary lookup: by name
        if (record.name && lookupFields.includes('name')) {
            const locations = await this.stockLocationService.findAll(ctx, {
                filter: { name: { eq: record.name } },
            });
            if (locations.totalItems > 0) {
                return { id: locations.items[0].id, entity: locations.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const location = await this.stockLocationService.findOne(ctx, record.id as ID);
            if (location) {
                return { id: location.id, entity: location };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: StockLocationInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Stock location name is required', code: 'REQUIRED' });
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.STOCK_LOCATION,
            fields: [
                {
                    key: 'name',
                    label: 'Location Name',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Name of the stock location/warehouse',
                    example: 'Main Warehouse',
                },
                {
                    key: 'description',
                    label: 'Description',
                    type: 'string',
                    description: 'Description of the location',
                    example: 'Primary distribution center',
                },
                {
                    key: 'customFields',
                    label: 'Custom Fields',
                    type: 'object',
                    description: 'Custom field values',
                },
            ],
        };
    }

    protected async createEntity(context: LoaderContext, record: StockLocationInput): Promise<ID | null> {
        const { ctx } = context;

        const location = await this.stockLocationService.create(ctx, {
            name: record.name,
            description: record.description || '',
            customFields: record.customFields as Record<string, unknown>,
        });

        this.logger.log(`Created stock location ${record.name} (ID: ${location.id})`);
        return location.id;
    }

    protected async updateEntity(context: LoaderContext, locationId: ID, record: StockLocationInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: locationId };

        if (record.name !== undefined && shouldUpdateField('name', options.updateOnlyFields)) {
            updateInput.name = record.name;
        }
        if (record.description !== undefined && shouldUpdateField('description', options.updateOnlyFields)) {
            updateInput.description = record.description;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        await this.stockLocationService.update(ctx, updateInput as Parameters<typeof this.stockLocationService.update>[1]);

        this.logger.debug(`Updated stock location ${record.name} (ID: ${locationId})`);
    }
}
