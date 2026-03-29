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
    OrderLine,
} from '@vendure/core';
import type { FulfillOrderInput } from '@vendure/common/lib/generated-types';
import type { FulfillmentState } from '@vendure/core';
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
    STATE_RANK,
} from './types';
import {
    findCustomerByEmail,
    findShippingMethodByCode,
    shouldUpdateField,
    handleOrderLines,
} from './helpers';
import type { OrderUpsertLoaderConfig } from '../../../shared/types';

/** Loads Order entities via OrderService. Supports CREATE, UPDATE, UPSERT. */
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
                        { key: 'unitPrice', label: 'Unit Price', type: 'number', description: 'Unit price in minor units (informational - Vendure uses variant price at time of import)' },
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
                    description: 'Code of the shipping method to use (auto-resolved if not provided)',
                    example: 'standard-shipping',
                },
                {
                    key: 'paymentMethodCode',
                    label: 'Payment Method',
                    type: 'string',
                    description: 'Code of the payment method for state transitions (auto-resolved if not provided)',
                    example: 'standard-payment',
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
                    description: 'Additional metadata from source system (stored via customFields - Vendure has no native metadata field)',
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

            // Create order without userId. Migration-imported customers may not have a User account.
            // OrderService.create(ctx, userId) calls findOneByUserId which only works for
            // customers with a linked User entity. Instead, create the order and directly
            // associate the customer via repository update.
            const order = await this.orderService.create(ctx);
            await this.connection.getRepository(ctx, Order).update(
                { id: order.id },
                { customer: { id: customer.id } as any }, // TypeORM accepts relation-by-ID pattern
            );

            // Preserve PIM order code (Vendure auto-generates codes; we override with source system code for idempotency)
            if (record.code) {
                await this.connection.getRepository(ctx, Order).update(
                    { id: order.id },
                    { code: record.code },
                );
            }

            // Handle order lines with mode (default: APPEND_ONLY for create to match current behavior)
            const linesMode = (context.options.config as unknown as OrderUpsertLoaderConfig)?.linesMode ?? 'APPEND_ONLY';
            await handleOrderLines(
                ctx,
                this.orderService,
                this.productVariantService,
                order.id,
                record.lines,
                linesMode,
                this.logger,
            );

            if (record.shippingAddress) {
                await this.orderService.setShippingAddress(ctx, order.id, record.shippingAddress);
            }
            // Billing address defaults to shipping address if not provided
            const billingAddr = record.billingAddress ?? record.shippingAddress;
            if (billingAddr) {
                await this.orderService.setBillingAddress(ctx, order.id, billingAddr);
            }

            // Set shipping method (explicit or auto-resolve first eligible, required for state transitions)
            await this.ensureShippingMethod(ctx, order.id, record.shippingMethodCode);

            if (record.customFields) {
                await this.orderService.updateCustomFields(ctx, order.id, record.customFields);
            }

            // Walk the order state machine to target state (migration flow)
            if (record.state) {
                await this.walkOrderStateMachine(ctx, order.id, record.state, record);
            }

            // Backdate order placement date (direct repository update, OrderService has no setter)
            if (record.orderPlacedAt) {
                const placedAt = record.orderPlacedAt instanceof Date
                    ? record.orderPlacedAt
                    : new Date(String(record.orderPlacedAt));
                if (!isNaN(placedAt.getTime())) {
                    await this.connection.getRepository(ctx, Order).update(
                        { id: order.id },
                        { orderPlacedAt: placedAt },
                    );
                }
            }

            this.logger.log(`Created order ${record.code ?? order.id} for ${record.customerEmail} (ID: ${order.id})`);
            return order.id;
        } catch (error) {
            this.logger.error(`Failed to create order: ${error}`);
            return null;
        }
    }

    protected async updateEntity(context: LoaderContext, orderId: ID, record: OrderInput): Promise<void> {
        const { ctx, options } = context;

        // Handle order lines with mode (default: REPLACE_ALL)
        if (record.lines && record.lines.length > 0 && shouldUpdateField('lines', options.updateOnlyFields)) {
            const linesMode = (options.config as unknown as OrderUpsertLoaderConfig)?.linesMode ?? 'REPLACE_ALL';
            await handleOrderLines(
                ctx,
                this.orderService,
                this.productVariantService,
                orderId,
                record.lines,
                linesMode,
                this.logger,
            );
        }

        if (record.shippingAddress && shouldUpdateField('shippingAddress', options.updateOnlyFields)) {
            await this.orderService.setShippingAddress(ctx, orderId, record.shippingAddress);
        }
        if (record.billingAddress && shouldUpdateField('billingAddress', options.updateOnlyFields)) {
            await this.orderService.setBillingAddress(ctx, orderId, record.billingAddress);
        }

        if (record.customFields && shouldUpdateField('customFields', options.updateOnlyFields)) {
            await this.orderService.updateCustomFields(ctx, orderId, record.customFields);
        }

        // Walk the state machine for updates too (handles intermediate transitions)
        // Ensure shipping method is set before state walking (required before ArrangingPayment)
        if (record.state && shouldUpdateField('state', options.updateOnlyFields)) {
            await this.ensureShippingMethod(ctx, orderId, record.shippingMethodCode);
            await this.walkOrderStateMachine(ctx, orderId, record.state, record);
        }

        if (record.orderPlacedAt && shouldUpdateField('orderPlacedAt', options.updateOnlyFields)) {
            const placedAt = record.orderPlacedAt instanceof Date
                ? record.orderPlacedAt
                : new Date(String(record.orderPlacedAt));
            if (!isNaN(placedAt.getTime())) {
                await this.connection.getRepository(ctx, Order).update(
                    { id: orderId },
                    { orderPlacedAt: placedAt },
                );
            }
        }

        this.logger.debug(`Updated order (ID: ${orderId})`);
    }

    /**
     * Ensure a shipping method is set on the order. Required before transitioning
     * to ArrangingPayment. If no explicit code is provided, auto-resolves
     * the first eligible shipping method.
     */
    private async ensureShippingMethod(ctx: RequestContext, orderId: ID, shippingMethodCode?: string): Promise<void> {
        if (shippingMethodCode) {
            const shippingMethod = await findShippingMethodByCode(ctx, this.shippingMethodService, shippingMethodCode);
            if (shippingMethod) {
                const eligibleMethods = await this.orderService.getEligibleShippingMethods(ctx, orderId);
                const method = eligibleMethods.find(m => m.id === shippingMethod.id);
                if (method) {
                    await this.orderService.setShippingMethod(ctx, orderId, [shippingMethod.id]);
                    return;
                }
                this.logger.warn(`Shipping method "${shippingMethodCode}" not eligible for order ${orderId}, falling back to auto-resolve`);
            } else {
                this.logger.warn(`Shipping method "${shippingMethodCode}" not found, falling back to auto-resolve`);
            }
        }

        // Auto-resolve: use first eligible shipping method
        const eligible = await this.orderService.getEligibleShippingMethods(ctx, orderId);
        if (eligible.length > 0) {
            await this.orderService.setShippingMethod(ctx, orderId, [eligible[0].id]);
        } else {
            this.logger.warn(`No eligible shipping methods found for order ${orderId}`);
        }
    }

    /**
     * Walk the order state machine from current state to target state.
     * Handles Vendure 3.x states in ranked order:
     *   Created/Draft(0) → AddingItems(1) → ArrangingPayment(2)
     *   → PaymentAuthorized(3) → PaymentSettled(4) → PartiallyShipped(5) → Shipped(6)
     *   → PartiallyDelivered(7) → Delivered(8)
     *
     * Note: Vendure 3.x removed ArrangingShipping. Shipping method must be set
     * while in AddingItems state (via ensureShippingMethod) before transitioning
     * to ArrangingPayment.
     *
     * Special requirements per transition:
     * - AddingItems → ArrangingPayment: shipping method must be set first
     * - ArrangingPayment → PaymentSettled: requires addPaymentToOrder() (not transitionToState)
     * - PartiallyShipped/Shipped/PartiallyDelivered/Delivered: simple transitionToState()
     */
    private async walkOrderStateMachine(
        ctx: RequestContext,
        orderId: ID,
        targetState: string,
        record: OrderInput,
    ): Promise<boolean> {
        const targetRank = STATE_RANK[targetState];
        if (targetRank === undefined) {
            // Unknown/custom state, try direct transition
            return this.tryTransition(ctx, orderId, targetState);
        }

        let order = await this.orderService.findOne(ctx, orderId);
        if (!order) return false;

        const rank = () => STATE_RANK[order!.state] ?? -1;
        const refresh = async () => { order = await this.orderService.findOne(ctx, orderId); };

        // Step 1: → ArrangingPayment (shipping method must be set before this transition)
        if (targetRank >= 2 && rank() < 2) {
            if (!await this.tryTransition(ctx, orderId, 'ArrangingPayment')) return false;
            await refresh();
        }

        // Step 2: → PaymentAuthorized/PaymentSettled (via addPaymentToOrder, not transitionToState)
        if (targetRank >= 3 && rank() < 3) {
            if (!await this.addPaymentForMigration(ctx, orderId, record.paymentMethodCode)) return false;
            await refresh();
        }

        // Step 2b: → PaymentSettled (if payment was authorized but not yet settled).
        // With dummyPaymentHandler (automaticSettle: true) rank may already be 4 (PaymentSettled).
        // With non-auto-settling handlers rank will be 3 (PaymentAuthorized) and needs explicit transition.
        if (targetRank >= 4 && rank() < 4) {
            if (!await this.tryTransition(ctx, orderId, 'PaymentSettled')) return false;
            await refresh();
        }

        // Step 3: Create fulfillment and transition to shipping/delivery states.
        // Vendure requires fulfillments before Shipped/Delivered transitions.
        // The fulfillment auto-transitions the order to Shipped (or Delivered).
        if (targetRank >= 5 && rank() < 5) {
            const fulfillTarget = targetRank >= 8 ? 'Delivered' as const : 'Shipped' as const;
            if (!await this.addFulfillmentForMigration(ctx, orderId, fulfillTarget)) return false;
            await refresh();
        }

        return true;
    }

    /**
     * Attempt a single state transition, logging warnings on failure.
     */
    private async tryTransition(ctx: RequestContext, orderId: ID, state: string): Promise<boolean> {
        try {
            const result = await this.orderService.transitionToState(
                ctx, orderId, state as Parameters<typeof this.orderService.transitionToState>[2],
            );
            if (result && typeof result === 'object' && 'errorCode' in result) {
                this.logger.warn(
                    `Cannot transition order ${orderId} to "${state}": ${(result as { message?: string; errorCode?: string }).message ?? (result as { errorCode?: string }).errorCode}`,
                );
                return false;
            }
            return true;
        } catch (err) {
            this.logger.warn(`Failed to transition order ${orderId} to "${state}": ${err}`);
            return false;
        }
    }

    /**
     * Add a payment to the order for migration purposes. Uses the specified payment
     * method code, or auto-resolves the first eligible payment method.
     * With dummyPaymentHandler (automaticSettle: true), this auto-transitions to PaymentSettled.
     */
    private async addPaymentForMigration(ctx: RequestContext, orderId: ID, paymentMethodCode?: string): Promise<boolean> {
        let methodCode = paymentMethodCode;

        if (!methodCode) {
            const eligible = await this.orderService.getEligiblePaymentMethods(ctx, orderId);
            if (eligible.length > 0) {
                methodCode = eligible[0].code;
            }
        }

        if (!methodCode) {
            this.logger.warn(`No payment method available for order ${orderId} migration`);
            return false;
        }

        const result = await this.orderService.addPaymentToOrder(ctx, orderId, {
            method: methodCode,
            metadata: { migrationImport: true },
        });

        if (result && typeof result === 'object' && 'errorCode' in result) {
            this.logger.warn(
                `Failed to add payment to order ${orderId}: ${(result as { message?: string; errorCode?: string }).message ?? (result as { errorCode?: string }).errorCode}`,
            );
            return false;
        }

        return true;
    }

    /**
     * Create a fulfillment for all order lines and transition it to Shipped.
     * Required before the order can transition to Shipped/Delivered states.
     */
    private async addFulfillmentForMigration(
        ctx: RequestContext,
        orderId: ID,
        targetFulfillmentState: 'Shipped' | 'Delivered' = 'Shipped',
    ): Promise<boolean> {
        const orderLines = await this.connection.getRepository(ctx, OrderLine).find({
            where: { order: { id: orderId } },
        });

        if (orderLines.length === 0) {
            this.logger.warn(`No order lines found for order ${orderId} - cannot create fulfillment`);
            return false;
        }

        const input: FulfillOrderInput = {
            lines: orderLines.map(line => ({
                orderLineId: line.id,
                quantity: line.quantity,
            })),
            handler: {
                code: 'manual-fulfillment',
                arguments: [
                    { name: 'method', value: 'Migration' },
                    { name: 'trackingCode', value: '' },
                ],
            },
        };

        const fulfillment = await this.orderService.createFulfillment(ctx, input);
        if (fulfillment && typeof fulfillment === 'object' && 'errorCode' in fulfillment) {
            this.logger.warn(
                `Failed to create fulfillment for order ${orderId}: ${(fulfillment as { message?: string; errorCode?: string }).message ?? (fulfillment as { errorCode?: string }).errorCode}`,
            );
            return false;
        }

        const fulfillmentId = (fulfillment as { id: ID }).id;

        // Transition fulfillment to Shipped
        const shipped = await this.orderService.transitionFulfillmentToState(
            ctx, fulfillmentId, 'Shipped' as FulfillmentState,
        );
        if (shipped && typeof shipped === 'object' && 'errorCode' in shipped) {
            this.logger.warn(
                `Failed to ship fulfillment for order ${orderId}: ${(shipped as { message?: string; errorCode?: string }).message ?? (shipped as { errorCode?: string }).errorCode}`,
            );
            return false;
        }

        // If target is Delivered, also transition fulfillment to Delivered
        if (targetFulfillmentState === 'Delivered') {
            const delivered = await this.orderService.transitionFulfillmentToState(
                ctx, fulfillmentId, 'Delivered' as FulfillmentState,
            );
            if (delivered && typeof delivered === 'object' && 'errorCode' in delivered) {
                this.logger.warn(
                    `Failed to deliver fulfillment for order ${orderId}: ${(delivered as { message?: string; errorCode?: string }).message ?? (delivered as { errorCode?: string }).errorCode}`,
                );
                return false;
            }
        }

        return true;
    }
}
