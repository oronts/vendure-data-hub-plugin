import { Injectable } from '@nestjs/common';
import {
    ID,
    PaymentMethod,
    RequestContext,
    TransactionalConnection,
    PaymentMethodService,
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
    PaymentMethodInput,
    PAYMENT_METHOD_LOADER_METADATA,
} from './types';
import {
    buildConfigurableOperation,
    shouldUpdateField,
} from './helpers';

/**
 * PaymentMethodLoader - Refactored to extend BaseEntityLoader
 *
 * Imports payment methods into Vendure with support for:
 * - Payment handlers (e.g., stripe, paypal, manual)
 * - Eligibility checkers (optional conditions)
 * - Translations for name and description
 *
 * The base class handles:
 * - Result initialization
 * - Validation loop
 * - Duplicate detection
 * - CREATE/UPDATE/UPSERT operation logic
 * - Dry run mode
 * - Error handling
 *
 * @example
 * ```typescript
 * const paymentMethodInput: PaymentMethodInput = {
 *   name: 'Credit Card',
 *   code: 'credit-card',
 *   description: 'Pay with Visa, Mastercard, or American Express',
 *   enabled: true,
 *   handler: {
 *     code: 'stripe-payment-handler',
 *     args: { apiKey: 'sk_test_...' },
 *   },
 * };
 * ```
 */
@Injectable()
export class PaymentMethodLoader extends BaseEntityLoader<PaymentMethodInput, PaymentMethod> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = PAYMENT_METHOD_LOADER_METADATA;

    private readonly lookupHelper: EntityLookupHelper<PaymentMethodService, PaymentMethod, PaymentMethodInput>;

    constructor(
        private connection: TransactionalConnection,
        private paymentMethodService: PaymentMethodService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PAYMENT_METHOD_LOADER);
        this.lookupHelper = createLookupHelper<PaymentMethodService, PaymentMethod, PaymentMethodInput>(this.paymentMethodService)
            .addFilterStrategy('code', 'code', (ctx, svc, opts) => svc.findAll(ctx, opts))
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id))
            .addFilterStrategy('name', 'name', (ctx, svc, opts) => svc.findAll(ctx, opts));
    }

    protected getDuplicateErrorMessage(record: PaymentMethodInput): string {
        return `Payment method with code "${record.code}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: PaymentMethodInput,
    ): Promise<ExistingEntityLookupResult<PaymentMethod> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        _ctx: RequestContext,
        record: PaymentMethodInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const builder = new ValidationBuilder()
            .requireStringForCreate('name', record.name, operation, 'Payment method name is required')
            .requireStringForCreate('code', record.code, operation, 'Payment method code is required');

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
            builder.addErrorIf(
                !record.handler || !record.handler.code,
                'handler',
                'Payment handler is required',
                'REQUIRED',
            );
        }

        return builder.build();
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.PAYMENT_METHOD,
            fields: [
                {
                    key: 'name',
                    label: 'Method Name',
                    type: 'string',
                    required: true,
                    translatable: true,
                    description: 'Display name for the payment method',
                    example: 'Credit Card',
                },
                {
                    key: 'code',
                    label: 'Code',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Unique code for the payment method',
                    example: 'credit-card',
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
                    example: 'Pay securely with your credit or debit card',
                },
                {
                    key: 'enabled',
                    label: 'Enabled',
                    type: 'boolean',
                    description: 'Whether this payment method is active',
                    example: true,
                },
                {
                    key: 'handler',
                    label: 'Payment Handler',
                    type: 'object',
                    required: true,
                    description: 'Payment handler configuration',
                    children: [
                        { key: 'code', label: 'Handler Code', type: 'string', required: true },
                        { key: 'args', label: 'Arguments', type: 'object' },
                    ],
                    example: { code: 'dummy-payment-handler', args: {} },
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

    protected async createEntity(context: LoaderContext, record: PaymentMethodInput): Promise<ID | null> {
        const { ctx } = context;

        const handler = buildConfigurableOperation(record.handler);

        const createInput: Record<string, unknown> = {
            code: record.code,
            enabled: record.enabled ?? true,
            handler,
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

        const method = await this.paymentMethodService.create(ctx, createInput as Parameters<typeof this.paymentMethodService.create>[1]);

        this.logger.log(`Created payment method ${record.name} (code: ${record.code}, ID: ${method.id})`);
        return method.id;
    }

    protected async updateEntity(context: LoaderContext, methodId: ID, record: PaymentMethodInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: methodId };

        if (record.code !== undefined && shouldUpdateField('code', options.updateOnlyFields)) {
            updateInput.code = record.code;
        }
        if (record.enabled !== undefined && shouldUpdateField('enabled', options.updateOnlyFields)) {
            updateInput.enabled = record.enabled;
        }
        if (record.handler !== undefined && shouldUpdateField('handler', options.updateOnlyFields)) {
            updateInput.handler = buildConfigurableOperation(record.handler);
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

        await this.paymentMethodService.update(ctx, updateInput as Parameters<typeof this.paymentMethodService.update>[1]);

        this.logger.debug(`Updated payment method ${record.name} (ID: ${methodId})`);
    }
}
