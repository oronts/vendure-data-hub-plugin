import { Injectable } from '@nestjs/common';
import {
    ID,
    ShippingMethod,
    RequestContext,
    TransactionalConnection,
    ShippingMethodService,
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
    createLookupHelper,
} from '../base';
import {
    ShippingMethodInput,
    SHIPPING_METHOD_LOADER_METADATA,
} from './types';
import {
    buildConfigurableOperation,
    shouldUpdateField,
} from './helpers';

/**
 * ShippingMethodLoader - Refactored to extend BaseEntityLoader
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
export class ShippingMethodLoader extends BaseEntityLoader<ShippingMethodInput, ShippingMethod> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = SHIPPING_METHOD_LOADER_METADATA;

    private readonly lookupHelper: EntityLookupHelper<ShippingMethodService, ShippingMethod, ShippingMethodInput>;

    constructor(
        private connection: TransactionalConnection,
        private shippingMethodService: ShippingMethodService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SHIPPING_METHOD_LOADER);
        this.lookupHelper = createLookupHelper<ShippingMethodService, ShippingMethod, ShippingMethodInput>(this.shippingMethodService)
            .addFilterStrategy('code', 'code', (ctx, svc, opts) => svc.findAll(ctx, opts))
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id))
            .addFilterStrategy('name', 'name', (ctx, svc, opts) => svc.findAll(ctx, opts));
    }

    protected getDuplicateErrorMessage(record: ShippingMethodInput): string {
        return `Shipping method with code "${record.code}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: ShippingMethodInput,
    ): Promise<ExistingEntityLookupResult<ShippingMethod> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        _ctx: RequestContext,
        record: ShippingMethodInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const builder = new ValidationBuilder()
            .requireStringForCreate('name', record.name, operation, 'Shipping method name is required')
            .requireStringForCreate('code', record.code, operation, 'Shipping method code is required');

        if (
            (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) &&
            record.code && typeof record.code === 'string' && record.code.trim() !== '' &&
            !/^[a-z0-9_-]+$/i.test(record.code)
        ) {
            builder.addError(
                'code',
                'Code must contain only letters, numbers, hyphens, and underscores',
                'INVALID_FORMAT',
            );
        }

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            builder
                .addErrorIf(
                    !record.fulfillmentHandler || typeof record.fulfillmentHandler !== 'string',
                    'fulfillmentHandler',
                    'Fulfillment handler is required',
                    'REQUIRED',
                )
                .addErrorIf(
                    !record.calculator || !record.calculator.code,
                    'calculator',
                    'Shipping calculator is required',
                    'REQUIRED',
                );
        }

        return builder.build();
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.SHIPPING_METHOD,
            fields: [
                {
                    key: 'name',
                    label: 'Method Name',
                    type: 'string',
                    required: true,
                    translatable: true,
                    description: 'Display name for the shipping method',
                    example: 'Standard Shipping',
                },
                {
                    key: 'code',
                    label: 'Code',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Unique code for the shipping method',
                    example: 'standard-shipping',
                    validation: {
                        pattern: '^[a-z0-9_-]+$',
                    },
                },
                {
                    key: 'description',
                    label: 'Description',
                    type: 'string',
                    translatable: true,
                    description: 'Description shown to customers',
                    example: 'Delivery in 3-5 business days',
                },
                {
                    key: 'fulfillmentHandler',
                    label: 'Fulfillment Handler',
                    type: 'string',
                    required: true,
                    description: 'Code of the fulfillment handler to use',
                    example: 'manual-fulfillment',
                },
                {
                    key: 'calculator',
                    label: 'Shipping Calculator',
                    type: 'object',
                    required: true,
                    description: 'Calculator configuration for shipping rates',
                    children: [
                        { key: 'code', label: 'Calculator Code', type: 'string', required: true },
                        { key: 'args', label: 'Arguments', type: 'object' },
                    ],
                    example: { code: 'default-shipping-calculator', args: { rate: 500 } },
                },
                {
                    key: 'checker',
                    label: 'Eligibility Checker',
                    type: 'object',
                    description: 'Optional checker to determine eligibility',
                    children: [
                        { key: 'code', label: 'Checker Code', type: 'string', required: true },
                        { key: 'args', label: 'Arguments', type: 'object' },
                    ],
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

    protected async createEntity(context: LoaderContext, record: ShippingMethodInput): Promise<ID | null> {
        const { ctx } = context;

        const calculator = buildConfigurableOperation(record.calculator);

        const createInput: Record<string, unknown> = {
            code: record.code,
            fulfillmentHandler: record.fulfillmentHandler,
            calculator,
            translations: [
                {
                    languageCode: ctx.languageCode,
                    name: record.name,
                    description: record.description || '',
                },
            ],
            customFields: record.customFields as Record<string, unknown>,
        };

        if (record.checker) {
            createInput.checker = buildConfigurableOperation(record.checker);
        }

        const method = await this.shippingMethodService.create(ctx, createInput as Parameters<typeof this.shippingMethodService.create>[1]);

        this.logger.log(`Created shipping method ${record.name} (code: ${record.code}, ID: ${method.id})`);
        return method.id;
    }

    protected async updateEntity(context: LoaderContext, methodId: ID, record: ShippingMethodInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: methodId };

        if (record.code !== undefined && shouldUpdateField('code', options.updateOnlyFields)) {
            updateInput.code = record.code;
        }
        if (record.fulfillmentHandler !== undefined && shouldUpdateField('fulfillmentHandler', options.updateOnlyFields)) {
            updateInput.fulfillmentHandler = record.fulfillmentHandler;
        }
        if (record.calculator !== undefined && shouldUpdateField('calculator', options.updateOnlyFields)) {
            updateInput.calculator = buildConfigurableOperation(record.calculator);
        }
        if (record.checker !== undefined && shouldUpdateField('checker', options.updateOnlyFields)) {
            updateInput.checker = buildConfigurableOperation(record.checker);
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        if ((record.name !== undefined && shouldUpdateField('name', options.updateOnlyFields)) ||
            (record.description !== undefined && shouldUpdateField('description', options.updateOnlyFields))) {
            updateInput.translations = [
                {
                    languageCode: ctx.languageCode,
                    name: record.name,
                    description: record.description,
                },
            ];
        }

        await this.shippingMethodService.update(ctx, updateInput as Parameters<typeof this.shippingMethodService.update>[1]);

        this.logger.debug(`Updated shipping method ${record.name} (ID: ${methodId})`);
    }
}
