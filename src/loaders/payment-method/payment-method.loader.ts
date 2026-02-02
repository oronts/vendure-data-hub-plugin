import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    PaymentMethodService,
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
import {
    PaymentMethodInput,
    ExistingEntityResult,
    PAYMENT_METHOD_LOADER_METADATA,
} from './types';
import {
    buildConfigurableOperation,
    isRecoverableError,
    shouldUpdateField,
} from './helpers';

/**
 * Payment Method Loader
 *
 * Imports payment methods into Vendure with support for:
 * - Payment handlers (e.g., stripe, paypal, manual)
 * - Eligibility checkers (optional conditions)
 * - Translations for name and description
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
export class PaymentMethodLoader implements EntityLoader<PaymentMethodInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = PAYMENT_METHOD_LOADER_METADATA.entityType;
    readonly name = PAYMENT_METHOD_LOADER_METADATA.name;
    readonly description = PAYMENT_METHOD_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...PAYMENT_METHOD_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...PAYMENT_METHOD_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...PAYMENT_METHOD_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private paymentMethodService: PaymentMethodService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PAYMENT_METHOD_LOADER);
    }

    async load(context: LoaderContext, records: PaymentMethodInput[]): Promise<EntityLoadResult> {
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
                            message: `Payment method with code "${record.code}" already exists`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    if (!context.dryRun) {
                        await this.updatePaymentMethod(context, existing.id, record);
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === TARGET_OPERATION.UPDATE) {
                        result.skipped++;
                        continue;
                    }

                    if (!context.dryRun) {
                        const newId = await this.createPaymentMethod(context, record);
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
                this.logger.error(`Failed to load payment method`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: PaymentMethodInput,
    ): Promise<ExistingEntityResult | null> {
        // Primary lookup: by code
        if (record.code && lookupFields.includes('code')) {
            const methods = await this.paymentMethodService.findAll(ctx, {
                filter: { code: { eq: record.code } },
            });
            if (methods.totalItems > 0) {
                return { id: methods.items[0].id, entity: methods.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const method = await this.paymentMethodService.findOne(ctx, record.id as ID);
            if (method) {
                return { id: method.id, entity: method };
            }
        }

        // Fallback: by name
        if (record.name && lookupFields.includes('name')) {
            const methods = await this.paymentMethodService.findAll(ctx, {
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
        record: PaymentMethodInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Payment method name is required', code: 'REQUIRED' });
            }

            if (!record.code || typeof record.code !== 'string' || record.code.trim() === '') {
                errors.push({ field: 'code', message: 'Payment method code is required', code: 'REQUIRED' });
            } else if (!/^[a-z0-9_-]+$/i.test(record.code)) {
                errors.push({
                    field: 'code',
                    message: 'Code must contain only letters, numbers, hyphens, and underscores',
                    code: 'INVALID_FORMAT',
                });
            }

            if (!record.handler || !record.handler.code) {
                errors.push({ field: 'handler', message: 'Payment handler is required', code: 'REQUIRED' });
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

    private async createPaymentMethod(context: LoaderContext, record: PaymentMethodInput): Promise<ID> {
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

    private async updatePaymentMethod(context: LoaderContext, methodId: ID, record: PaymentMethodInput): Promise<void> {
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
