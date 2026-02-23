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
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderMetadata,
    ValidationBuilder,
    EntityLookupHelper,
} from '../base';
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

    private readonly lookupHelper: EntityLookupHelper<TaxRateService, TaxRate, TaxRateInput>;

    constructor(
        private connection: TransactionalConnection,
        private taxRateService: TaxRateService,
        private taxCategoryService: TaxCategoryService,
        private zoneService: ZoneService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.TAX_RATE_LOADER);
        this.lookupHelper = new EntityLookupHelper<TaxRateService, TaxRate, TaxRateInput>(this.taxRateService)
            .addCustomStrategy({
                fieldName: 'name',
                lookup: async (ctx, svc, value) => {
                    if (!value || typeof value !== 'string') return null;
                    const taxRates = await svc.findAll(ctx);
                    const match = taxRates.items.find(tr => tr.name === value);
                    if (match) {
                        return { id: match.id, entity: match as TaxRate };
                    }
                    return null;
                },
            })
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id) as Promise<TaxRate | null>);
    }

    protected preprocessRecords(records: TaxRateInput[]): TaxRateInput[] {
        this.resolverCache.clear();
        return records;
    }

    protected getDuplicateErrorMessage(record: TaxRateInput): string {
        return `Tax rate "${record.name}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: TaxRateInput,
    ): Promise<ExistingEntityLookupResult<TaxRate> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        ctx: RequestContext,
        record: TaxRateInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const builder = new ValidationBuilder()
            .requireStringForCreate('name', record.name, operation, 'Tax rate name is required');

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            // Tax rate value validation
            if (record.value === undefined || record.value === null) {
                builder.addError('value', 'Tax rate value is required', 'REQUIRED');
            } else if (typeof record.value !== 'number' || record.value < 0 || record.value > 100) {
                builder.addError(
                    'value',
                    'Tax rate value must be a number between 0 and 100',
                    'INVALID_VALUE',
                );
            }

            // Tax category validation
            if (!record.taxCategoryCode && !record.taxCategoryId) {
                builder.addError('taxCategoryCode', 'Tax category code or ID is required', 'REQUIRED');
            } else {
                const taxCategoryId = await resolveTaxCategoryId(
                    ctx,
                    this.taxCategoryService,
                    record,
                    this.resolverCache,
                );
                if (!taxCategoryId) {
                    builder.addError(
                        'taxCategoryCode',
                        `Tax category "${record.taxCategoryCode}" not found`,
                        'TAX_CATEGORY_NOT_FOUND',
                    );
                }
            }

            // Zone validation
            if (!record.zoneCode && !record.zoneId) {
                builder.addError('zoneCode', 'Zone code or ID is required', 'REQUIRED');
            } else {
                const zoneId = await resolveZoneId(
                    ctx,
                    this.zoneService,
                    record,
                    this.resolverCache,
                );
                if (!zoneId) {
                    builder.addError(
                        'zoneCode',
                        `Zone "${record.zoneCode}" not found`,
                        'ZONE_NOT_FOUND',
                    );
                }
            }
        }

        return builder.build();
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
