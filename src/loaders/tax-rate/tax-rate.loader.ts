import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
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
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger/datahub-logger';
import { LOGGER_CONTEXTS } from '../../constants/core';
import { PAGINATION } from '../../constants/defaults';
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    getLoaderExecutionCache,
    LoaderExecutionState,
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
import { getErrorMessage } from '../../utils/error.utils';

const REFERENCE_CACHE_NAMESPACE = 'tax-rate-loader:references';

/** Loads TaxRate entities via TaxRateService. Supports CREATE, UPDATE, UPSERT. */
@Injectable()
export class TaxRateLoader extends BaseEntityLoader<TaxRateInput, TaxRate> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = TAX_RATE_LOADER_METADATA;

    private readonly lookupHelper: EntityLookupHelper<TaxRateService, TaxRate, TaxRateInput>;

    constructor(
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
                    const taxRates = await svc.findAll(ctx, { take: PAGINATION.MAX_LOOKUP_LIMIT });
                    const match = taxRates.items.find(tr => tr.name === value);
                    if (match) {
                        return { id: match.id, entity: match as TaxRate };
                    }
                    return null;
                },
            })
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id) as Promise<TaxRate | null>);
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
        executionState?: LoaderExecutionState,
    ): Promise<EntityValidationResult> {
        const resolverCache = getLoaderExecutionCache(
            executionState,
            REFERENCE_CACHE_NAMESPACE,
        );
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

            if (record.taxCategoryCode !== undefined && record.taxCategoryId !== undefined) {
                builder.addError(
                    'taxCategoryId',
                    'Provide either taxCategoryId or taxCategoryCode, not both',
                    'INVALID_VALUE',
                );
            } else if (record.taxCategoryCode === undefined && record.taxCategoryId === undefined) {
                builder.addError('taxCategoryCode', 'Tax category code or ID is required', 'REQUIRED');
            } else {
                try {
                    const taxCategoryId = await resolveTaxCategoryId(
                        ctx,
                        this.taxCategoryService,
                        record,
                        resolverCache,
                    );
                    if (!taxCategoryId) throw new Error('Tax category code was not found');
                } catch (error) {
                    builder.addError(
                        record.taxCategoryId !== undefined ? 'taxCategoryId' : 'taxCategoryCode',
                        getErrorMessage(error),
                        'TAX_CATEGORY_NOT_FOUND',
                    );
                }
            }

            if (record.zoneCode !== undefined && record.zoneId !== undefined) {
                builder.addError(
                    'zoneId',
                    'Provide either zoneId or zoneCode, not both',
                    'INVALID_VALUE',
                );
            } else if (record.zoneCode === undefined && record.zoneId === undefined) {
                builder.addError('zoneCode', 'Zone code or ID is required', 'REQUIRED');
            } else {
                try {
                    const zoneId = await resolveZoneId(
                        ctx,
                        this.zoneService,
                        record,
                        resolverCache,
                    );
                    if (!zoneId) throw new Error('Zone code was not found');
                } catch (error) {
                    builder.addError(
                        record.zoneId !== undefined ? 'zoneId' : 'zoneCode',
                        getErrorMessage(error),
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
                    description: 'Code stored in the TaxCategory customFields.code field',
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
                    description: 'Code stored in the Zone customFields.code field',
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

    protected async createEntity(
        context: LoaderContext,
        record: TaxRateInput,
        executionState?: LoaderExecutionState,
    ): Promise<ID | null> {
        const { ctx } = context;
        const resolverCache = getLoaderExecutionCache(
            executionState,
            REFERENCE_CACHE_NAMESPACE,
        );

        // Resolve tax category ID
        const taxCategoryId = await resolveTaxCategoryId(
            ctx,
            this.taxCategoryService,
            record,
            resolverCache,
        );
        if (!taxCategoryId) {
            throw new Error('Tax category code was not found during create');
        }

        // Resolve zone ID
        const zoneId = await resolveZoneId(
            ctx,
            this.zoneService,
            record,
            resolverCache,
        );
        if (!zoneId) {
            throw new Error('Zone code was not found during create');
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

    protected async updateEntity(
        context: LoaderContext,
        taxRateId: ID,
        record: TaxRateInput,
        executionState?: LoaderExecutionState,
    ): Promise<void> {
        const { ctx, options } = context;
        const resolverCache = getLoaderExecutionCache(
            executionState,
            REFERENCE_CACHE_NAMESPACE,
        );

        // Resolve tax category ID if needed
        let taxCategoryId: ID | undefined;
        const taxCategoryField = record.taxCategoryId !== undefined
            ? 'taxCategoryId'
            : 'taxCategoryCode';
        if (
            (record.taxCategoryCode !== undefined || record.taxCategoryId !== undefined)
            && shouldUpdateField(taxCategoryField, options.updateOnlyFields)
        ) {
            taxCategoryId = await resolveTaxCategoryId(
                ctx,
                this.taxCategoryService,
                record,
                resolverCache,
            ) || undefined;
            if (!taxCategoryId) {
                throw new Error('Tax category code was not found during update');
            }
        }

        // Resolve zone ID if needed
        let zoneId: ID | undefined;
        const zoneField = record.zoneId !== undefined ? 'zoneId' : 'zoneCode';
        if (
            (record.zoneCode !== undefined || record.zoneId !== undefined)
            && shouldUpdateField(zoneField, options.updateOnlyFields)
        ) {
            zoneId = await resolveZoneId(
                ctx,
                this.zoneService,
                record,
                resolverCache,
            ) || undefined;
            if (!zoneId) {
                throw new Error('Zone code was not found during update');
            }

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
