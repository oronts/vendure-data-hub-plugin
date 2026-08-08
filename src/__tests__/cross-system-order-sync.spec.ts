import { describe, expect, it, vi } from 'vitest';
import type {
    OrderService,
    RequestContext,
    ShippingMethodService,
    TransactionalConnection,
} from '@vendure/core';
import { crossSystemOrderSync } from '../../dev-server/examples/pipelines/multi-source-pipelines';
import { SHOPIFY_API_CONNECTION_CODE } from '../../dev-server/shopify-api';
import type { DataHubLoggerFactory } from '../services/logger';
import type { LoaderRegistryService } from '../loaders/registry';
import type { PipelineStepDefinition } from '../types';
import { deriveCapabilities } from '../types/typed-config';
import type { ExecutorContext } from '../runtime/executor-types';
import { TransformExecutor } from '../runtime/executors/transform.executor';
import { OrderTransitionHandler } from '../runtime/executors/loaders/order-handler';
import { OrderUpsertHandler } from '../runtime/executors/loaders/order-upsert-handler';

const ORDER_RECORD = {
    code: 'ORDER-1',
    customerEmail: 'customer@example.com',
    state: 'PaymentSettled',
    lines: [{ sku: 'SKU-1', quantity: 1 }],
};

const PROCESSING_ORDER_RECORD = {
    ...ORDER_RECORD,
    state: 'Shipped',
};

function getStep(key: string): PipelineStepDefinition {
    const step = crossSystemOrderSync.steps.find(candidate => candidate.key === key);
    if (!step) {
        throw new Error(`Cross-system order sync step "${key}" was not found`);
    }
    return step;
}

function createTransformExecutor(
    loaderRegistry?: Partial<LoaderRegistryService>,
): TransformExecutor {
    return new TransformExecutor({
        createLogger: vi.fn(() => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        })),
    } as unknown as DataHubLoggerFactory, undefined, undefined, loaderRegistry as LoaderRegistryService);
}

function createExecutorContext(): ExecutorContext {
    return {
        cpData: {},
        cpDirty: false,
        markCheckpointDirty: vi.fn(),
    };
}

describe('cross-system order sync definition', () => {
    it('binds customer enrichment authentication through the saved connection', () => {
        const enrich = getStep('enrich-customers');
        const operators = enrich.config.operators as Array<{
            op?: string;
            args?: Record<string, unknown>;
        }>;
        const lookup = operators.find(operator => operator.op === 'httpLookup');

        expect(lookup?.args).toMatchObject({
            connectionCode: SHOPIFY_API_CONNECTION_CODE,
        });
        expect(lookup?.args).not.toHaveProperty('headers.X-Shopify-Access-Token');
    });

    it('records prerequisite metadata and preflights target orders by code', () => {
        expect(crossSystemOrderSync.dependsOn).toEqual([
            'pim-catalog-sync',
            'pim-customer-sync',
        ]);
        expect(getStep('find-existing-order')).toMatchObject({
            type: 'ENRICH',
            config: {
                sourceType: 'VENDURE',
                entityType: 'ORDER',
                sourceField: 'code',
                lookupField: 'code',
                target: '_vendureOrder',
            },
        });
    });

    it('declares the exact permission and write domain derived from its loaders', () => {
        expect(crossSystemOrderSync.capabilities).toEqual({
            requires: ['UpdateOrder'],
            writes: ['ORDERS'],
        });
        expect(deriveCapabilities(crossSystemOrderSync.steps)).toEqual({
            requires: ['UpdateOrder'],
            writes: ['ORDERS'],
        });
    });

    it('uses explicit create, update, and cancellation loader contracts', () => {
        expect(getStep('load-create-orders')).toMatchObject({
            type: 'LOAD',
            adapterCode: 'orderUpsert',
            config: {
                strategy: 'CREATE',
                lookupFields: 'code',
                skipDuplicates: true,
            },
        });
        expect(getStep('load-update-orders')).toMatchObject({
            type: 'LOAD',
            adapterCode: 'orderUpsert',
            config: {
                strategy: 'UPDATE',
                lookupFields: 'code',
                linesMode: 'SKIP',
            },
        });
        expect(getStep('load-cancel-orders')).toMatchObject({
            type: 'LOAD',
            adapterCode: 'orderTransition',
            config: {
                orderCodeField: 'code',
                state: 'Cancelled',
            },
        });
    });

    it('routes existing targets through loaders and reports missing targets without loading', () => {
        expect(crossSystemOrderSync.edges).toEqual(expect.arrayContaining([
            { from: 'route-by-status', to: 'prepare-create', branch: 'settled' },
            { from: 'prepare-create', to: 'load-create-orders' },
            { from: 'load-create-orders', to: 'export-sync-attempts' },
            { from: 'route-by-status', to: 'prepare-update', branch: 'processing-existing' },
            { from: 'prepare-update', to: 'load-update-orders' },
            { from: 'load-update-orders', to: 'export-sync-attempts' },
            { from: 'route-by-status', to: 'prepare-cancel', branch: 'cancelled-existing' },
            { from: 'prepare-cancel', to: 'load-cancel-orders' },
            { from: 'load-cancel-orders', to: 'export-sync-attempts' },
            { from: 'route-by-status', to: 'prepare-missing-update', branch: 'processing-missing' },
            { from: 'prepare-missing-update', to: 'export-missing-targets' },
            { from: 'route-by-status', to: 'prepare-missing-cancel', branch: 'cancelled-missing' },
            { from: 'prepare-missing-cancel', to: 'export-missing-targets' },
        ]));
        expect(getStep('export-sync-attempts').config).toMatchObject({
            filenamePattern: 'order-sync-attempts.csv',
        });
        expect(getStep('export-missing-targets').config).toMatchObject({
            filenamePattern: 'order-sync-missing-targets.csv',
        });
        expect(crossSystemOrderSync.steps.some(step =>
            step.key === 'export-sync-report'
            || step.config.filenamePattern === 'order-sync-report.csv',
        )).toBe(false);
    });
});

describe('cross-system order sync runtime contracts', () => {
    it('normalizes bundled shipping/payment defaults while preserving source values', async () => {
        const executor = createTransformExecutor();

        const result = await executor.executeOperator(
            {} as RequestContext,
            getStep('transform-orders'),
            [{
                ...ORDER_RECORD,
                shippingMethodCode: 'freight-shipping',
                state: 'PaymentAuthorized',
                lines: [{ sku: 'SKU-1', quantity: 2, unitPrice: 1250 }],
                _shopifyCustomer: { found: false },
            }],
            createExecutorContext(),
        );

        expect(result).toEqual([
            expect.objectContaining({
                shippingMethodCode: 'standard-shipping',
                sourceShippingMethodCode: 'freight-shipping',
                state: 'PaymentSettled',
                sourceState: 'PaymentAuthorized',
                orderTotal: 2500,
                syncSummary: 'Order ORDER-1: 1 items, total 2500 cents',
            }),
        ]);
    });

    it('preflights targets and routes missing updates/cancellations away from loaders', async () => {
        const findExisting = vi.fn(async (
            _ctx: RequestContext,
            _lookupFields: string[],
            record: { code?: string },
        ) => record.code?.startsWith('EXISTING')
            ? { id: record.code, entity: { id: record.code } }
            : null);
        const executor = createTransformExecutor({
            get: vi.fn(() => ({ findExisting } as never)),
        });
        const records = await executor.executeEnrich(
            {} as RequestContext,
            getStep('find-existing-order'),
            [
                { code: 'EXISTING-PROCESSING', _routeStatus: 'processing' },
                { code: 'MISSING-PROCESSING', _routeStatus: 'processing' },
                { code: 'EXISTING-CANCELLED', _routeStatus: 'cancelled' },
                { code: 'MISSING-CANCELLED', _routeStatus: 'cancelled' },
            ],
        );
        const output = await executor.executeRouteBranches(
            {} as RequestContext,
            getStep('route-by-status'),
            records,
        );

        expect(output.branches['processing-existing']).toEqual([
            expect.objectContaining({ code: 'EXISTING-PROCESSING', _vendureOrder: { id: 'EXISTING-PROCESSING' } }),
        ]);
        expect(output.branches['processing-missing']).toEqual([
            expect.objectContaining({ code: 'MISSING-PROCESSING' }),
        ]);
        expect(output.branches['cancelled-existing']).toEqual([
            expect.objectContaining({ code: 'EXISTING-CANCELLED', _vendureOrder: { id: 'EXISTING-CANCELLED' } }),
        ]);
        expect(output.branches['cancelled-missing']).toEqual([
            expect.objectContaining({ code: 'MISSING-CANCELLED' }),
        ]);
        expect(output.branches.default).toEqual([]);
        expect(findExisting).toHaveBeenCalledTimes(4);
    });

    it.each([
        ['prepare-missing-update', 'UPDATE'],
        ['prepare-missing-cancel', 'CANCEL'],
    ])('reports %s records as explicitly not attempted', async (stepKey, syncIntent) => {
        const executor = createTransformExecutor();

        await expect(executor.executeOperator(
            {} as RequestContext,
            getStep(stepKey),
            [{
                code: 'MISSING-ORDER',
                _routeStatus: 'processing',
            }],
            createExecutorContext(),
        )).resolves.toEqual([{
            code: 'MISSING-ORDER',
            syncIntent,
            syncOutcome: 'NOT_ATTEMPTED',
            syncReason: 'ORDER_NOT_FOUND',
        }]);
    });

    it('executes the create branch as idempotent CREATE-by-code', async () => {
        const load = vi.fn().mockResolvedValue({
            succeeded: 1,
            failed: 0,
            skipped: 0,
            errors: [],
        });
        const handler = new OrderUpsertHandler({ load } as never);

        await expect(handler.execute(
            {} as RequestContext,
            getStep('load-create-orders'),
            [ORDER_RECORD],
        )).resolves.toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(load).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: 'CREATE',
                lookupFields: ['code'],
                options: { skipDuplicates: true },
            }),
            [expect.objectContaining(ORDER_RECORD)],
        );
    });

    it('executes the processing branch as UPDATE-by-code without replacing immutable lines', async () => {
        const load = vi.fn().mockResolvedValue({
            succeeded: 1,
            failed: 0,
            skipped: 0,
            errors: [],
        });
        const handler = new OrderUpsertHandler({ load } as never);

        await expect(handler.execute(
            {} as RequestContext,
            getStep('load-update-orders'),
            [PROCESSING_ORDER_RECORD],
        )).resolves.toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(load).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: 'UPDATE',
                lookupFields: ['code'],
                options: {
                    skipDuplicates: false,
                    config: { linesMode: 'SKIP' },
                },
            }),
            [expect.objectContaining(PROCESSING_ORDER_RECORD)],
        );
    });

    it('resolves cancellation records by code and transitions the Vendure order', async () => {
        const ctx = {} as RequestContext;
        const existingOrder = { id: 1, code: ORDER_RECORD.code, state: 'PaymentSettled' };
        const orderService = {
            findOneByCode: vi.fn().mockResolvedValue(existingOrder),
            transitionToState: vi.fn().mockResolvedValue({ id: 1, state: 'Cancelled' }),
        };
        const connection = {
            withTransaction: vi.fn(async (
                transactionCtx: RequestContext,
                work: (innerCtx: RequestContext) => Promise<unknown>,
            ) => work(transactionCtx)),
        };
        const handler = new OrderTransitionHandler(
            orderService as unknown as OrderService,
            connection as unknown as TransactionalConnection,
            {} as ShippingMethodService,
            { createLogger: vi.fn(() => ({ warn: vi.fn() })) } as unknown as DataHubLoggerFactory,
        );

        await expect(handler.execute(
            ctx,
            getStep('load-cancel-orders'),
            [{ code: ORDER_RECORD.code }],
        )).resolves.toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(orderService.findOneByCode).toHaveBeenCalledWith(ctx, ORDER_RECORD.code);
        expect(orderService.transitionToState).toHaveBeenCalledWith(ctx, 1, 'Cancelled');
    });
});
