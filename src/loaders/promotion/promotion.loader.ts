import { Injectable } from '@nestjs/common';
import {
    ID,
    Promotion,
    RequestContext,
    TransactionalConnection,
    PromotionService,
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
    PromotionInput,
    PROMOTION_LOADER_METADATA,
    DEFAULT_PROMOTION_ACTION,
} from './types';
import {
    buildConfigurableOperations,
    shouldUpdateField,
} from './helpers';

/**
 * PromotionLoader - Refactored to extend BaseEntityLoader
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
export class PromotionLoader extends BaseEntityLoader<PromotionInput, Promotion> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = PROMOTION_LOADER_METADATA;

    constructor(
        private connection: TransactionalConnection,
        private promotionService: PromotionService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PROMOTION_LOADER);
    }

    protected getDuplicateErrorMessage(record: PromotionInput): string {
        return `Promotion with coupon code "${record.couponCode}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: PromotionInput,
    ): Promise<ExistingEntityLookupResult<Promotion> | null> {
        // Primary lookup: by coupon code
        if (record.couponCode && lookupFields.includes('couponCode')) {
            const promotions = await this.promotionService.findAll(ctx, {
                filter: { couponCode: { eq: record.couponCode } },
            });
            if (promotions.totalItems > 0) {
                return { id: promotions.items[0].id, entity: promotions.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const promotion = await this.promotionService.findOne(ctx, record.id as ID);
            if (promotion) {
                return { id: promotion.id, entity: promotion };
            }
        }

        // Fallback: by name (exact match)
        if (record.name && lookupFields.includes('name')) {
            const promotions = await this.promotionService.findAll(ctx, {
                filter: { name: { eq: record.name } },
            });
            if (promotions.totalItems > 0) {
                return { id: promotions.items[0].id, entity: promotions.items[0] };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: PromotionInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Promotion name is required', code: 'REQUIRED' });
            }

            if (!record.actions || record.actions.length === 0) {
                warnings.push({
                    field: 'actions',
                    message: 'No actions specified. Promotion will have no effect.',
                });
            }
        }

        if (record.startsAt && record.endsAt) {
            const start = new Date(record.startsAt);
            const end = new Date(record.endsAt);
            if (start >= end) {
                errors.push({
                    field: 'endsAt',
                    message: 'End date must be after start date',
                    code: 'INVALID_DATE_RANGE',
                });
            }
        }

        if (record.usageLimit !== undefined && record.usageLimit < 0) {
            errors.push({
                field: 'usageLimit',
                message: 'Usage limit must be non-negative',
                code: 'INVALID_VALUE',
            });
        }
        if (record.perCustomerUsageLimit !== undefined && record.perCustomerUsageLimit < 0) {
            errors.push({
                field: 'perCustomerUsageLimit',
                message: 'Per-customer usage limit must be non-negative',
                code: 'INVALID_VALUE',
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.PROMOTION,
            fields: [
                {
                    key: 'name',
                    label: 'Promotion Name',
                    type: 'string',
                    required: true,
                    translatable: true,
                    description: 'Display name for the promotion',
                    example: 'Summer Sale 20% Off',
                },
                {
                    key: 'description',
                    label: 'Description',
                    type: 'string',
                    translatable: true,
                    description: 'Description shown to customers',
                },
                {
                    key: 'couponCode',
                    label: 'Coupon Code',
                    type: 'string',
                    lookupable: true,
                    description: 'Code customers enter at checkout (leave empty for automatic promotions)',
                    example: 'SUMMER20',
                },
                {
                    key: 'perCustomerUsageLimit',
                    label: 'Per Customer Limit',
                    type: 'number',
                    description: 'Maximum uses per customer (0 = unlimited)',
                    example: 1,
                },
                {
                    key: 'usageLimit',
                    label: 'Total Usage Limit',
                    type: 'number',
                    description: 'Maximum total uses (0 = unlimited)',
                    example: 100,
                },
                {
                    key: 'startsAt',
                    label: 'Start Date',
                    type: 'date',
                    description: 'When promotion becomes active (ISO 8601)',
                    example: '2024-06-01T00:00:00Z',
                },
                {
                    key: 'endsAt',
                    label: 'End Date',
                    type: 'date',
                    description: 'When promotion expires (ISO 8601)',
                    example: '2024-08-31T23:59:59Z',
                },
                {
                    key: 'enabled',
                    label: 'Enabled',
                    type: 'boolean',
                    description: 'Whether promotion is active',
                },
                {
                    key: 'conditions',
                    label: 'Conditions',
                    type: 'array',
                    description: 'Conditions that must be met to apply promotion',
                    children: [
                        { key: 'code', label: 'Condition Code', type: 'string', required: true },
                        { key: 'args', label: 'Arguments', type: 'object' },
                    ],
                },
                {
                    key: 'actions',
                    label: 'Actions',
                    type: 'array',
                    description: 'Discount actions to apply',
                    children: [
                        { key: 'code', label: 'Action Code', type: 'string', required: true },
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

    protected async createEntity(context: LoaderContext, record: PromotionInput): Promise<ID | null> {
        const { ctx } = context;

        const conditions = buildConfigurableOperations(record.conditions ?? []);
        const actions = buildConfigurableOperations(record.actions ?? []);

        if (actions.length === 0) {
            actions.push({ ...DEFAULT_PROMOTION_ACTION });
        }

        const result = await this.promotionService.createPromotion(ctx, {
            enabled: record.enabled ?? true,
            couponCode: record.couponCode,
            perCustomerUsageLimit: record.perCustomerUsageLimit,
            usageLimit: record.usageLimit,
            startsAt: record.startsAt ? new Date(record.startsAt) : undefined,
            endsAt: record.endsAt ? new Date(record.endsAt) : undefined,
            conditions,
            actions,
            translations: [
                {
                    languageCode: ctx.languageCode,
                    name: record.name,
                    description: record.description || '',
                },
            ],
            customFields: record.customFields,
        });

        if ('errorCode' in result) {
            throw new Error(`Failed to create promotion: ${result.message}`);
        }

        const promotion = result;
        this.logger.log(`Created promotion ${record.name} (coupon: ${record.couponCode || 'none'}, ID: ${promotion.id})`);
        return promotion.id;
    }

    protected async updateEntity(context: LoaderContext, promotionId: ID, record: PromotionInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: promotionId };

        if (record.enabled !== undefined && shouldUpdateField('enabled', options.updateOnlyFields)) {
            updateInput.enabled = record.enabled;
        }
        if (record.couponCode !== undefined && shouldUpdateField('couponCode', options.updateOnlyFields)) {
            updateInput.couponCode = record.couponCode;
        }
        if (record.perCustomerUsageLimit !== undefined && shouldUpdateField('perCustomerUsageLimit', options.updateOnlyFields)) {
            updateInput.perCustomerUsageLimit = record.perCustomerUsageLimit;
        }
        if (record.usageLimit !== undefined && shouldUpdateField('usageLimit', options.updateOnlyFields)) {
            updateInput.usageLimit = record.usageLimit;
        }
        if (record.startsAt !== undefined && shouldUpdateField('startsAt', options.updateOnlyFields)) {
            updateInput.startsAt = new Date(record.startsAt);
        }
        if (record.endsAt !== undefined && shouldUpdateField('endsAt', options.updateOnlyFields)) {
            updateInput.endsAt = new Date(record.endsAt);
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

        if (record.conditions && shouldUpdateField('conditions', options.updateOnlyFields)) {
            updateInput.conditions = buildConfigurableOperations(record.conditions);
        }

        if (record.actions && shouldUpdateField('actions', options.updateOnlyFields)) {
            updateInput.actions = buildConfigurableOperations(record.actions);
        }

        const result = await this.promotionService.updatePromotion(ctx, updateInput as Parameters<typeof this.promotionService.updatePromotion>[1]);

        if ('errorCode' in result) {
            throw new Error(`Failed to update promotion: ${result.message}`);
        }

        this.logger.debug(`Updated promotion ${record.name} (ID: ${promotionId})`);
    }
}
