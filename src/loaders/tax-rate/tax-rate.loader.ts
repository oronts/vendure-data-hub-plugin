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
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import { BaseEntityLoader, ExistingEntityLookupResult, LoaderMetadata } from '../base';
import {
    TaxRateInput,
    TAX_RATE_LOADER_METADATA,
} from './types';
import {
    resolveTaxCategoryId,
    resolveZoneId,
    shouldUpdateField,
} from './helpers';

/**
 * Tax Rate Loader - Refactored to extend BaseEntityLoader
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
export class TaxRateLoader extends BaseEntityLoader<TaxRateInput, TaxRate> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = TAX_RATE_LOADER_METADATA;

    // Cache for resolved IDs to avoid repeated lookups
    private resolverCache = new Map<string, ID>();

    constructor(
        private connection: TransactionalConnection,
        private taxRateService: TaxRateService,
        private taxCategoryService: TaxCategoryService,
        private zoneService: ZoneService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.TAX_RATE_LOADER);
    }

    protected getDuplicateErrorMessage(record: TaxRateInput): string {
        return `Tax rate "${record.name}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: TaxRateInput,
    ): Promise<ExistingEntityLookupResult<TaxRate> | null> {
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
        ctx: RequestContext,
        record: TaxRateInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
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
            } else {
                // Validate that the tax category exists
                const taxCategoryId = await resolveTaxCategoryId(
                    ctx,
                    this.taxCategoryService,
                    record,
                    this.resolverCache,
                );
                if (!taxCategoryId) {
                    errors.push({
                        field: 'taxCategoryCode',
                        message: `Tax category "${record.taxCategoryCode}" not found`,
                        code: 'TAX_CATEGORY_NOT_FOUND',
                    });
                }
            }

            if (!record.zoneCode && !record.zoneId) {
                errors.push({
                    field: 'zoneCode',
                    message: 'Zone code or ID is required',
                    code: 'REQUIRED',
                });
            } else {
                // Validate that the zone exists
                const zoneId = await resolveZoneId(
                    ctx,
                    this.zoneService,
                    record,
                    this.resolverCache,
                );
                if (!zoneId) {
                    errors.push({
                        field: 'zoneCode',
                        message: `Zone "${record.zoneCode}" not found`,
                        code: 'ZONE_NOT_FOUND',
                    });
                }
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
            entityType: VendureEntityType.TAX_RATE,
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

    protected async createEntity(context: LoaderContext, record: TaxRateInput): Promise<ID | null> {
        const { ctx } = context;

        // Resolve tax category ID
        const taxCategoryId = await resolveTaxCategoryId(
            ctx,
            this.taxCategoryService,
            record,
            this.resolverCache,
        );
        if (!taxCategoryId) {
            this.logger.error(`Tax category "${record.taxCategoryCode}" not found during create`);
            return null;
        }

        // Resolve zone ID
        const zoneId = await resolveZoneId(
            ctx,
            this.zoneService,
            record,
            this.resolverCache,
        );
        if (!zoneId) {
            this.logger.error(`Zone "${record.zoneCode}" not found during create`);
            return null;
        }

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

    protected async updateEntity(context: LoaderContext, taxRateId: ID, record: TaxRateInput): Promise<void> {
        const { ctx, options } = context;

        // Resolve tax category ID if needed
        let taxCategoryId: ID | undefined;
        if ((record.taxCategoryCode || record.taxCategoryId) && shouldUpdateField('taxCategoryId', options.updateOnlyFields)) {
            taxCategoryId = await resolveTaxCategoryId(
                ctx,
                this.taxCategoryService,
                record,
                this.resolverCache,
            ) || undefined;
        }

        // Resolve zone ID if needed
        let zoneId: ID | undefined;
        if ((record.zoneCode || record.zoneId) && shouldUpdateField('zoneId', options.updateOnlyFields)) {
            zoneId = await resolveZoneId(
                ctx,
                this.zoneService,
                record,
                this.resolverCache,
            ) || undefined;
        }

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
        if (taxCategoryId) {
            updateInput.categoryId = taxCategoryId;
        }
        if (zoneId) {
            updateInput.zoneId = zoneId;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        await this.taxRateService.update(ctx, updateInput as Parameters<typeof this.taxRateService.update>[1]);

        this.logger.debug(`Updated tax rate ${record.name} (ID: ${taxRateId})`);
    }
}
