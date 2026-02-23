import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    OrderService,
    CustomerService,
    ProductVariantService,
    ShippingMethodService,
    Order,
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
    OrderInput,
    ORDER_LOADER_METADATA,
} from './types';
import {
    findCustomerByEmail,
    findVariantBySku,
    findShippingMethodByCode,
    shouldUpdateField,
} from './helpers';

/**
 * OrderLoader - Refactored to extend BaseEntityLoader
 *
 * Imports orders for system migrations (not for normal order processing).
 * Orders should normally go through the standard checkout flow.
 */
@Injectable()
export class OrderLoader extends BaseEntityLoader<OrderInput, Order> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = ORDER_LOADER_METADATA;

    private readonly lookupHelper: EntityLookupHelper<OrderService, Order, OrderInput>;

    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private customerService: CustomerService,
        private productVariantService: ProductVariantService,
        private shippingMethodService: ShippingMethodService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ORDER_LOADER);
        this.lookupHelper = new EntityLookupHelper<OrderService, Order, OrderInput>(this.orderService)
            .addCustomStrategy({
                fieldName: 'code',
                lookup: async (ctx, svc, value) => {
                    if (!value || typeof value !== 'string') return null;
                    const order = await svc.findOneByCode(ctx, value);
                    if (order) {
                        return { id: order.id, entity: order };
                    }
                    return null;
                },
            })
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id));
    }

    protected getDuplicateErrorMessage(record: OrderInput): string {
        return `Order with code "${record.code}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: OrderInput,
    ): Promise<ExistingEntityLookupResult<Order> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        _ctx: RequestContext,
        record: OrderInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const builder = new ValidationBuilder()
            .requireEmailForCreate('customerEmail', record.customerEmail, operation, 'Customer email is required')
            .requireArrayForCreate('lines', record.lines, operation, 'At least one order line is required');

        // Validate individual order lines
        if (
            (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) &&
            record.lines && Array.isArray(record.lines) && record.lines.length > 0
        ) {
            builder.validateArrayItems('lines', record.lines, (line) => {
                const errors: { field: string; message: string; code?: string }[] = [];
                if (!line.sku) {
                    errors.push({ field: 'sku', message: 'Line SKU is required', code: 'REQUIRED' });
                }
                if (!line.quantity || line.quantity < 1) {
                    errors.push({ field: 'quantity', message: 'Line quantity must be at least 1', code: 'INVALID_VALUE' });
                }
                return errors;
            });
        }

        // Validate addresses
        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (record.shippingAddress) {
                builder.validateAddress(record.shippingAddress, 'shippingAddress');
            }
            if (record.billingAddress) {
                builder.validateAddress(record.billingAddress, 'billingAddress');
            }
        }

        builder.addWarning(
            '_general',
            'Order import is intended for migrations only. Normal orders should go through checkout.',
        );

        return builder.build();
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.ORDER,
            fields: [
                {
                    key: 'code',
                    label: 'Order Code',
                    type: 'string',
                    lookupable: true,
                    description: 'Unique order code (auto-generated if not provided)',
                    example: 'ORD-2024-001',
                },
                {
                    key: 'customerEmail',
                    label: 'Customer Email',
                    type: 'string',
                    required: true,
                    description: 'Email of the customer placing the order',
                    example: 'customer@example.com',
                },
                {
                    key: 'lines',
                    label: 'Order Lines',
                    type: 'array',
                    required: true,
                    description: 'Array of line items',
                    children: [
                        { key: 'sku', label: 'Product SKU', type: 'string', required: true },
                        { key: 'quantity', label: 'Quantity', type: 'number', required: true },
                        { key: 'unitPrice', label: 'Unit Price', type: 'number', description: 'Override price (uses variant price if not set)' },
                        { key: 'customFields', label: 'Custom Fields', type: 'object' },
                    ],
                },
                {
                    key: 'shippingAddress',
                    label: 'Shipping Address',
                    type: 'object',
                    description: 'Shipping address details',
                    children: [
                        { key: 'fullName', label: 'Full Name', type: 'string' },
                        { key: 'streetLine1', label: 'Street Line 1', type: 'string', required: true },
                        { key: 'streetLine2', label: 'Street Line 2', type: 'string' },
                        { key: 'city', label: 'City', type: 'string', required: true },
                        { key: 'province', label: 'Province/State', type: 'string' },
                        { key: 'postalCode', label: 'Postal Code', type: 'string', required: true },
                        { key: 'countryCode', label: 'Country Code', type: 'string', required: true },
                        { key: 'phoneNumber', label: 'Phone', type: 'string' },
                    ],
                },
                {
                    key: 'billingAddress',
                    label: 'Billing Address',
                    type: 'object',
                    description: 'Billing address (defaults to shipping if not provided)',
                },
                {
                    key: 'shippingMethodCode',
                    label: 'Shipping Method',
                    type: 'string',
                    description: 'Code of the shipping method to use',
                    example: 'standard-shipping',
                },
                {
                    key: 'state',
                    label: 'Order State',
                    type: 'string',
                    description: 'Target order state after import',
                    example: 'PaymentSettled',
                },
                {
                    key: 'orderPlacedAt',
                    label: 'Order Date',
                    type: 'date',
                    description: 'Original order placement date (ISO 8601)',
                    example: '2024-01-15T10:30:00Z',
                },
                {
                    key: 'metadata',
                    label: 'Metadata',
                    type: 'object',
                    description: 'Additional metadata from source system',
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

    protected async createEntity(context: LoaderContext, record: OrderInput): Promise<ID | null> {
        const { ctx } = context;

        try {
            const customer = await findCustomerByEmail(ctx, this.customerService, record.customerEmail);
            if (!customer) {
                this.logger.warn(`Customer with email "${record.customerEmail}" not found. Order import requires existing customer.`);
                return null;
            }

            const order = await this.orderService.create(ctx, customer.id);

            for (const line of record.lines) {
                const variant = await findVariantBySku(this.productVariantService, ctx, line.sku);
                if (!variant) {
                    this.logger.warn(`Variant with SKU "${line.sku}" not found, skipping line`);
                    continue;
                }

                await this.orderService.addItemToOrder(ctx, order.id, variant.id, line.quantity);
            }

            if (record.shippingAddress) {
                await this.orderService.setShippingAddress(ctx, order.id, record.shippingAddress);
            }
            if (record.billingAddress) {
                await this.orderService.setBillingAddress(ctx, order.id, record.billingAddress);
            }

            if (record.shippingMethodCode) {
                const shippingMethod = await findShippingMethodByCode(ctx, this.shippingMethodService, record.shippingMethodCode);
                if (shippingMethod) {
                    const eligibleMethods = await this.orderService.getEligibleShippingMethods(ctx, order.id);
                    const method = eligibleMethods.find(m => m.id === shippingMethod.id);
                    if (method) {
                        await this.orderService.setShippingMethod(ctx, order.id, [shippingMethod.id]);
                    }
                }
            }

            if (record.customFields) {
                await this.orderService.updateCustomFields(ctx, order.id, record.customFields);
            }

            this.logger.log(`Created order for ${record.customerEmail} (ID: ${order.id})`);
            return order.id;
        } catch (error) {
            this.logger.error(`Failed to create order: ${error}`);
            return null;
        }
    }

    protected async updateEntity(context: LoaderContext, orderId: ID, record: OrderInput): Promise<void> {
        const { ctx, options } = context;

        if (record.shippingAddress && shouldUpdateField('shippingAddress', options.updateOnlyFields)) {
            await this.orderService.setShippingAddress(ctx, orderId, record.shippingAddress);
        }
        if (record.billingAddress && shouldUpdateField('billingAddress', options.updateOnlyFields)) {
            await this.orderService.setBillingAddress(ctx, orderId, record.billingAddress);
        }

        if (record.customFields && shouldUpdateField('customFields', options.updateOnlyFields)) {
            await this.orderService.updateCustomFields(ctx, orderId, record.customFields);
        }

        this.logger.debug(`Updated order (ID: ${orderId})`);
    }
}
