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
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger/datahub-logger';
import { LOGGER_CONTEXTS } from '../../constants/core';
import { TARGET_OPERATION } from '../../constants/enums';
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
    shouldUpdateField,
    handleOrderLines,
} from './helpers';
import type { OrderUpsertLoaderConfig } from '../../../shared/types';
import { ORDER_FIELD_SCHEMA } from './order-field-schema';
import { OrderMigrationLifecycle } from './order-migration-lifecycle';
import { parseOrderPlacedAt } from './order-record.validation';

/** Loads Order entities via OrderService. Supports CREATE, UPDATE, UPSERT. */
@Injectable()
export class OrderLoader extends BaseEntityLoader<OrderInput, Order> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = ORDER_LOADER_METADATA;

    private readonly lookupHelper: EntityLookupHelper<OrderService, Order, OrderInput>;
    private readonly migrationLifecycle: OrderMigrationLifecycle;

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
        this.migrationLifecycle = new OrderMigrationLifecycle({
            orderService: this.orderService,
            connection: this.connection,
            shippingMethodService: this.shippingMethodService,
            logger: this.logger,
        });
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
        // Build identifier for better error messages
        const identifier = record.code || record.customerEmail || record.id || 'unknown';

        const builder = new ValidationBuilder()
            .withIdentifier(`code="${identifier}"`)
            .withLineNumber(ValidationBuilder.getLineNumber(record as Record<string, unknown>))
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
                if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1) {
                    errors.push({
                        field: 'quantity',
                        message: 'Line quantity must be at least 1 and a whole number',
                        code: 'INVALID_VALUE',
                    });
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

        if (record.orderPlacedAt !== undefined) {
            try {
                parseOrderPlacedAt(record.orderPlacedAt);
            } catch (error) {
                builder.addError(
                    'orderPlacedAt',
                    error instanceof Error ? error.message : String(error),
                    'INVALID_VALUE',
                );
            }
        }

        builder.addWarning(
            '_general',
            'Order import is intended for migrations only. Normal orders should go through checkout.',
        );

        return builder.build();
    }

    getFieldSchema(): EntityFieldSchema {
        return ORDER_FIELD_SCHEMA;
    }

    protected async createEntity(context: LoaderContext, record: OrderInput): Promise<ID | null> {
        return this.connection.withTransaction(context.ctx, async ctx =>
            this.createOrderEntity({ ...context, ctx }, record),
        );
    }

    private async createOrderEntity(context: LoaderContext, record: OrderInput): Promise<ID | null> {
        const { ctx } = context;
        const customer = await findCustomerByEmail(ctx, this.customerService, record.customerEmail);
        if (!customer) {
            this.logger.warn(
                `Customer with email "${record.customerEmail}" not found. Order import requires existing customer.`,
            );
            return null;
        }

        const order = await this.orderService.create(ctx);
        await this.orderService.updateOrderCustomer(ctx, {
            orderId: order.id,
            customerId: customer.id,
        });
        await this.setSourceOrderCode(ctx, order.id, record.code);
        await this.updateOrderLines(context, order.id, record, 'APPEND_ONLY');
        await this.updateOrderAddresses(ctx, order.id, record, true);
        await this.migrationLifecycle.ensureShippingMethod(ctx, order.id, record.shippingMethodCode);
        await this.updateCustomFields(ctx, order.id, record);
        await this.transitionOrder(ctx, order.id, record);
        await this.setOrderPlacedAt(ctx, order.id, record.orderPlacedAt);

        this.logger.log(
            `Created order ${record.code ?? order.id} for ${record.customerEmail} (ID: ${order.id})`,
        );
        return order.id;
    }

    protected async updateEntity(context: LoaderContext, orderId: ID, record: OrderInput): Promise<void> {
        await this.connection.withTransaction(context.ctx, async ctx =>
            this.updateOrderEntity({ ...context, ctx }, orderId, record),
        );
    }

    private async updateOrderEntity(context: LoaderContext, orderId: ID, record: OrderInput): Promise<void> {
        const { ctx, options } = context;

        if (record.lines && record.lines.length > 0 && shouldUpdateField('lines', options.updateOnlyFields)) {
            await this.updateOrderLines(context, orderId, record, 'REPLACE_ALL');
        }
        await this.updateOrderAddresses(ctx, orderId, record, false, options.updateOnlyFields);
        if (record.customFields && shouldUpdateField('customFields', options.updateOnlyFields)) {
            await this.updateCustomFields(ctx, orderId, record);
        }
        if (record.state && shouldUpdateField('state', options.updateOnlyFields)) {
            await this.migrationLifecycle.ensureShippingMethod(ctx, orderId, record.shippingMethodCode);
            await this.transitionOrder(ctx, orderId, record);
        }
        if (record.orderPlacedAt && shouldUpdateField('orderPlacedAt', options.updateOnlyFields)) {
            await this.setOrderPlacedAt(ctx, orderId, record.orderPlacedAt);
        }
        this.logger.debug(`Updated order (ID: ${orderId})`);
    }

    private async setSourceOrderCode(
        ctx: RequestContext,
        orderId: ID,
        code?: string,
    ): Promise<void> {
        if (code) {
            await this.connection.getRepository(ctx, Order).update({ id: orderId }, { code });
        }
    }

    private async updateOrderLines(
        context: LoaderContext,
        orderId: ID,
        record: OrderInput,
        defaultMode: 'APPEND_ONLY' | 'REPLACE_ALL',
    ): Promise<void> {
        const config = context.options.config as unknown as OrderUpsertLoaderConfig;
        await handleOrderLines(
            context.ctx,
            this.orderService,
            this.productVariantService,
            orderId,
            record.lines,
            config?.linesMode ?? defaultMode,
            this.logger,
        );
    }

    private async updateOrderAddresses(
        ctx: RequestContext,
        orderId: ID,
        record: OrderInput,
        defaultBillingToShipping: boolean,
        updateOnlyFields?: string[],
    ): Promise<void> {
        if (record.shippingAddress && shouldUpdateField('shippingAddress', updateOnlyFields)) {
            await this.orderService.setShippingAddress(ctx, orderId, record.shippingAddress);
        }
        const billingAddress = record.billingAddress ??
            (defaultBillingToShipping ? record.shippingAddress : undefined);
        if (billingAddress && shouldUpdateField('billingAddress', updateOnlyFields)) {
            await this.orderService.setBillingAddress(ctx, orderId, billingAddress);
        }
    }

    private async updateCustomFields(
        ctx: RequestContext,
        orderId: ID,
        record: OrderInput,
    ): Promise<void> {
        if (record.customFields) {
            await this.orderService.updateCustomFields(ctx, orderId, record.customFields);
        }
    }

    private async transitionOrder(
        ctx: RequestContext,
        orderId: ID,
        record: OrderInput,
    ): Promise<void> {
        if (!record.state) {
            return;
        }
        const transitioned = await this.migrationLifecycle.transitionToTarget(
            ctx,
            orderId,
            record.state,
            {
                paymentMethodCode: record.paymentMethodCode,
                paymentMetadata: { migrationImport: true },
            },
        );
        if (!transitioned) {
            throw new Error(`Failed to transition order ${orderId} to "${record.state}"`);
        }
    }

    private async setOrderPlacedAt(
        ctx: RequestContext,
        orderId: ID,
        value?: string | Date,
    ): Promise<void> {
        const placedAt = parseOrderPlacedAt(value);
        if (!placedAt) return;
        await this.connection.getRepository(ctx, Order).update(
            { id: orderId },
            { orderPlacedAt: placedAt },
        );
    }
}
