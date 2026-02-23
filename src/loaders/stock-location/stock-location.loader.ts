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
import { VendureEntityType } from '../../constants/enums';
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderMetadata,
    ValidationBuilder,
    EntityLookupHelper,
    createLookupHelper,
} from '../base';
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

    private readonly lookupHelper: EntityLookupHelper<StockLocationService, StockLocation, StockLocationInput>;

    constructor(
        private connection: TransactionalConnection,
        private stockLocationService: StockLocationService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.STOCK_LOCATION_LOADER);
        this.lookupHelper = createLookupHelper<StockLocationService, StockLocation, StockLocationInput>(this.stockLocationService)
            .addFilterStrategy('name', 'name', (ctx, svc, opts) => svc.findAll(ctx, opts))
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id));
    }

    protected getDuplicateErrorMessage(record: StockLocationInput): string {
        return `Stock location "${record.name}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: StockLocationInput,
    ): Promise<ExistingEntityLookupResult<StockLocation> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        _ctx: RequestContext,
        record: StockLocationInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        return new ValidationBuilder()
            .requireStringForCreate('name', record.name, operation, 'Stock location name is required')
            .build();
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
