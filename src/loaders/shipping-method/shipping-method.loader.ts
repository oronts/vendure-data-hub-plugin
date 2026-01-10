import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    ShippingMethodService,
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
    ShippingMethodInput,
    ExistingEntityResult,
    SHIPPING_METHOD_LOADER_METADATA,
} from './types';
import {
    buildConfigurableOperation,
    isRecoverableError,
    shouldUpdateField,
} from './helpers';

@Injectable()
export class ShippingMethodLoader implements EntityLoader<ShippingMethodInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = SHIPPING_METHOD_LOADER_METADATA.entityType;
    readonly name = SHIPPING_METHOD_LOADER_METADATA.name;
    readonly description = SHIPPING_METHOD_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...SHIPPING_METHOD_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...SHIPPING_METHOD_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...SHIPPING_METHOD_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private shippingMethodService: ShippingMethodService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SHIPPING_METHOD_LOADER);
    }

    async load(context: LoaderContext, records: ShippingMethodInput[]): Promise<EntityLoadResult> {
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
                    if (context.operation === 'CREATE') {
                        if (context.options.skipDuplicates) {
                            result.skipped++;
                            continue;
                        }
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Shipping method with code "${record.code}" already exists`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    if (!context.dryRun) {
                        await this.updateShippingMethod(context, existing.id, record);
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === 'UPDATE') {
                        result.skipped++;
                        continue;
                    }

                    if (!context.dryRun) {
                        const newId = await this.createShippingMethod(context, record);
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
                this.logger.error(`Failed to load shipping method`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: ShippingMethodInput,
    ): Promise<ExistingEntityResult | null> {
        // Primary lookup: by code
        if (record.code && lookupFields.includes('code')) {
            const methods = await this.shippingMethodService.findAll(ctx, {
                filter: { code: { eq: record.code } },
            });
            if (methods.totalItems > 0) {
                return { id: methods.items[0].id, entity: methods.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const method = await this.shippingMethodService.findOne(ctx, record.id as ID);
            if (method) {
                return { id: method.id, entity: method };
            }
        }

        // Fallback: by name
        if (record.name && lookupFields.includes('name')) {
            const methods = await this.shippingMethodService.findAll(ctx, {
                filter: { name: { eq: record.name } },
            });
            if (methods.totalItems > 0) {
                return { id: methods.items[0].id, entity: methods.items[0] };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: ShippingMethodInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === 'CREATE' || operation === 'UPSERT') {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Shipping method name is required', code: 'REQUIRED' });
            }
            if (!record.code || typeof record.code !== 'string' || record.code.trim() === '') {
                errors.push({ field: 'code', message: 'Shipping method code is required', code: 'REQUIRED' });
            } else if (!/^[a-z0-9_-]+$/i.test(record.code)) {
                errors.push({
                    field: 'code',
                    message: 'Code must contain only letters, numbers, hyphens, and underscores',
                    code: 'INVALID_FORMAT'
                });
            }
            if (!record.fulfillmentHandler || typeof record.fulfillmentHandler !== 'string') {
                errors.push({ field: 'fulfillmentHandler', message: 'Fulfillment handler is required', code: 'REQUIRED' });
            }
            if (!record.calculator || !record.calculator.code) {
                errors.push({ field: 'calculator', message: 'Shipping calculator is required', code: 'REQUIRED' });
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
            entityType: 'ShippingMethod',
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

    private async createShippingMethod(context: LoaderContext, record: ShippingMethodInput): Promise<ID> {
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

    private async updateShippingMethod(context: LoaderContext, methodId: ID, record: ShippingMethodInput): Promise<void> {
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
