import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    TaxRateService,
    TaxCategoryService,
    ZoneService,
    TaxRate,
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
import {
    TaxRateInput,
    ExistingEntityResult,
    TAX_RATE_LOADER_METADATA,
} from './types';
import {
    resolveTaxCategoryId,
    resolveZoneId,
    isRecoverableError,
    shouldUpdateField,
} from './helpers';

/**
 * Tax Rate Loader
 *
 * Imports tax rates into Vendure with automatic resolution of:
 * - Tax categories by code/name
 * - Zones by code/name
 *
 * Supports CREATE, UPDATE, UPSERT, and DELETE operations.
 *
 * @example
 * ```typescript
 * const taxRateInput: TaxRateInput = {
 *   name: 'Standard Rate',
 *   value: 20, // 20%
 *   taxCategoryCode: 'standard',
 *   zoneCode: 'UK',
 *   enabled: true,
 * };
 * ```
 */
@Injectable()
export class TaxRateLoader implements EntityLoader<TaxRateInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = TAX_RATE_LOADER_METADATA.entityType;
    readonly name = TAX_RATE_LOADER_METADATA.name;
    readonly description = TAX_RATE_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...TAX_RATE_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...TAX_RATE_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...TAX_RATE_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private taxRateService: TaxRateService,
        private taxCategoryService: TaxCategoryService,
        private zoneService: ZoneService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.TAX_RATE_LOADER);
    }

    async load(context: LoaderContext, records: TaxRateInput[]): Promise<EntityLoadResult> {
        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };

        // Cache for resolved IDs to avoid repeated lookups
        const resolverCache = new Map<string, ID>();

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

                // Resolve tax category ID
                const taxCategoryId = await resolveTaxCategoryId(
                    context.ctx,
                    this.taxCategoryService,
                    record,
                    resolverCache,
                );
                if (!taxCategoryId) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: `Tax category "${record.taxCategoryCode}" not found`,
                        code: 'TAX_CATEGORY_NOT_FOUND',
                        recoverable: false,
                    });
                    continue;
                }

                // Resolve zone ID
                const zoneId = await resolveZoneId(
                    context.ctx,
                    this.zoneService,
                    record,
                    resolverCache,
                );
                if (!zoneId) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: `Zone "${record.zoneCode}" not found`,
                        code: 'ZONE_NOT_FOUND',
                        recoverable: false,
                    });
                    continue;
                }

                const existing = await this.findExisting(context.ctx, context.lookupFields, record);

                if (existing) {
                    if (context.operation === 'CREATE') {
                        if (context.options.skipDuplicates) {
                            result.skipped++;
                            continue;
                        }
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Tax rate "${record.name}" already exists`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    if (!context.dryRun) {
                        await this.updateTaxRate(context, existing.id, record, taxCategoryId, zoneId);
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === 'UPDATE') {
                        result.skipped++;
                        continue;
                    }

                    if (!context.dryRun) {
                        const newId = await this.createTaxRate(context, record, taxCategoryId, zoneId);
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
                this.logger.error(`Failed to load tax rate`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: TaxRateInput,
    ): Promise<ExistingEntityResult | null> {
        // Primary lookup: by name (within same category and zone if possible)
        if (record.name && lookupFields.includes('name')) {
            const taxRates = await this.taxRateService.findAll(ctx);
            const match = taxRates.items.find(tr => tr.name === record.name);
            if (match) {
                return { id: match.id, entity: match as TaxRate };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const taxRate = await this.taxRateService.findOne(ctx, record.id as ID);
            if (taxRate) {
                return { id: taxRate.id, entity: taxRate as TaxRate };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: TaxRateInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === 'CREATE' || operation === 'UPSERT') {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Tax rate name is required', code: 'REQUIRED' });
            }

            if (record.value === undefined || record.value === null) {
                errors.push({ field: 'value', message: 'Tax rate value is required', code: 'REQUIRED' });
            } else if (typeof record.value !== 'number' || record.value < 0 || record.value > 100) {
                errors.push({
                    field: 'value',
                    message: 'Tax rate value must be a number between 0 and 100',
                    code: 'INVALID_VALUE',
                });
            }

            if (!record.taxCategoryCode && !record.taxCategoryId) {
                errors.push({
                    field: 'taxCategoryCode',
                    message: 'Tax category code or ID is required',
                    code: 'REQUIRED',
                });
            }

            if (!record.zoneCode && !record.zoneId) {
                errors.push({
                    field: 'zoneCode',
                    message: 'Zone code or ID is required',
                    code: 'REQUIRED',
                });
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
            entityType: 'TaxRate',
            fields: [
                {
                    key: 'name',
                    label: 'Tax Rate Name',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Display name for the tax rate (e.g., "Standard Rate", "Reduced Rate")',
                    example: 'Standard Rate',
                },
                {
                    key: 'value',
                    label: 'Rate (%)',
                    type: 'number',
                    required: true,
                    description: 'Tax rate percentage (0-100)',
                    example: 20,
                    validation: {
                        min: 0,
                        max: 100,
                    },
                },
                {
                    key: 'enabled',
                    label: 'Enabled',
                    type: 'boolean',
                    description: 'Whether this tax rate is active',
                    example: true,
                },
                {
                    key: 'taxCategoryCode',
                    label: 'Tax Category Code',
                    type: 'string',
                    required: true,
                    description: 'Code/name of the tax category this rate belongs to',
                    example: 'standard',
                },
                {
                    key: 'taxCategoryId',
                    label: 'Tax Category ID',
                    type: 'string',
                    description: 'ID of the tax category (alternative to taxCategoryCode)',
                },
                {
                    key: 'zoneCode',
                    label: 'Zone Code',
                    type: 'string',
                    required: true,
                    description: 'Code/name of the zone where this tax rate applies',
                    example: 'UK',
                },
                {
                    key: 'zoneId',
                    label: 'Zone ID',
                    type: 'string',
                    description: 'ID of the zone (alternative to zoneCode)',
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

    private async createTaxRate(
        context: LoaderContext,
        record: TaxRateInput,
        taxCategoryId: ID,
        zoneId: ID,
    ): Promise<ID> {
        const { ctx } = context;

        const taxRate = await this.taxRateService.create(ctx, {
            name: record.name,
            value: record.value,
            enabled: record.enabled ?? true,
            categoryId: taxCategoryId,
            zoneId: zoneId,
            customFields: record.customFields as Record<string, unknown>,
        });

        this.logger.log(`Created tax rate ${record.name} (${record.value}%, ID: ${taxRate.id})`);
        return taxRate.id;
    }

    private async updateTaxRate(
        context: LoaderContext,
        taxRateId: ID,
        record: TaxRateInput,
        taxCategoryId: ID,
        zoneId: ID,
    ): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: taxRateId };

        if (record.name !== undefined && shouldUpdateField('name', options.updateOnlyFields)) {
            updateInput.name = record.name;
        }
        if (record.value !== undefined && shouldUpdateField('value', options.updateOnlyFields)) {
            updateInput.value = record.value;
        }
        if (record.enabled !== undefined && shouldUpdateField('enabled', options.updateOnlyFields)) {
            updateInput.enabled = record.enabled;
        }
        if (shouldUpdateField('taxCategoryId', options.updateOnlyFields)) {
            updateInput.categoryId = taxCategoryId;
        }
        if (shouldUpdateField('zoneId', options.updateOnlyFields)) {
            updateInput.zoneId = zoneId;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        await this.taxRateService.update(ctx, updateInput as Parameters<typeof this.taxRateService.update>[1]);

        this.logger.debug(`Updated tax rate ${record.name} (ID: ${taxRateId})`);
    }
}
