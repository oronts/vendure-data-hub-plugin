import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    StockLocationService,
    StockLocation,
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
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import { StockLocationInput, STOCK_LOCATION_LOADER_METADATA } from './types';
import { isRecoverableError, shouldUpdateField } from './helpers';

@Injectable()
export class StockLocationLoader implements EntityLoader<StockLocationInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = STOCK_LOCATION_LOADER_METADATA.entityType;
    readonly name = STOCK_LOCATION_LOADER_METADATA.name;
    readonly description = STOCK_LOCATION_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...STOCK_LOCATION_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...STOCK_LOCATION_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...STOCK_LOCATION_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private stockLocationService: StockLocationService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.STOCK_LOCATION_LOADER);
    }

    async load(context: LoaderContext, records: StockLocationInput[]): Promise<EntityLoadResult> {
        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };

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

                const existing = await this.findExisting(context.ctx, context.lookupFields, record);

                if (existing) {
                    if (context.operation === TARGET_OPERATION.CREATE) {
                        if (context.options.skipDuplicates) {
                            result.skipped++;
                            continue;
                        }
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Stock location "${record.name}" already exists`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    if (!context.dryRun) {
                        await this.updateStockLocation(context, existing.id, record);
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === TARGET_OPERATION.UPDATE) {
                        result.skipped++;
                        continue;
                    }

                    if (!context.dryRun) {
                        const newId = await this.createStockLocation(context, record);
                        result.affectedIds.push(newId);
                    }
                    result.created++;
                }

                result.succeeded++;
            } catch (error) {
                result.failed++;
                result.errors.push({
                    record,
                    message: error instanceof Error ? error.message : String(error),
                    recoverable: isRecoverableError(error),
                });
                this.logger.error(`Failed to load stock location`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: StockLocationInput,
    ): Promise<{ id: ID; entity: StockLocation } | null> {
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

    private async createStockLocation(context: LoaderContext, record: StockLocationInput): Promise<ID> {
        const { ctx } = context;

        const location = await this.stockLocationService.create(ctx, {
            name: record.name,
            description: record.description || '',
            customFields: record.customFields as Record<string, unknown>,
        });

        this.logger.log(`Created stock location ${record.name} (ID: ${location.id})`);
        return location.id;
    }

    private async updateStockLocation(context: LoaderContext, locationId: ID, record: StockLocationInput): Promise<void> {
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
