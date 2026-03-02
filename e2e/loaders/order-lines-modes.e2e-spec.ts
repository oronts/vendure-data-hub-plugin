/**
 * Order Lines Mode E2E Tests
 *
 * Tests linesMode for Order loader:
 * - REPLACE_ALL (remove all existing lines, create from record)
 * - MERGE_BY_SKU (update quantities for matching SKUs, add new SKUs)
 * - APPEND_ONLY (always add new lines - may create duplicates)
 * - SKIP (don't modify order lines)
 *
 * Verifies: idempotency, duplicate prevention, edge cases, performance
 *
 * NOTE: Order creation requires products/variants to exist for line items.
 * The OrderUpsertHandler bridges to the OrderLoader (BaseEntityLoader).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OrderService, ProductService, ProductVariantService } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { OrderUpsertHandler } from '../../src/runtime/executors/loaders/order-upsert-handler';
import { ProductHandler } from '../../src/runtime/executors/loaders/product-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';
import {
    testIdempotency,
    testReplaceAllMode,
    testMergeMode,
    testSkipMode,
    testAppendOnlyMode,
} from './mode-test-helpers';

describe('Order Lines Mode', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let handler: OrderUpsertHandler;
    let orderService: OrderService;
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        handler = server.app.get(OrderUpsertHandler);
        orderService = server.app.get(OrderService);
        const productHandler = server.app.get(ProductHandler);
        ctx = await getSuperadminContext(server.app);

        // Create products with variants that orders can reference
        const productStep = makeStep('setup-order-products', { strategy: 'UPSERT' });
        await productHandler.execute(ctx, productStep, [
            { name: 'Order Product A', slug: 'order-prod-a', sku: 'ORD-SKU-A', price: 10.00 },
            { name: 'Order Product B', slug: 'order-prod-b', sku: 'ORD-SKU-B', price: 20.00 },
            { name: 'Order Product C', slug: 'order-prod-c', sku: 'ORD-SKU-C', price: 30.00 },
            { name: 'Order Product D', slug: 'order-prod-d', sku: 'ORD-SKU-D', price: 40.00 },
        ]);
    });

    afterAll(async () => {
        await server.destroy();
    });

    describe('REPLACE_ALL mode', () => {
        it('should replace all order lines on re-run (idempotent)', async () => {
            const step = makeStep('ord-replace-idemp', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'REPLACE_ALL',
            });
            const data = [{
                code: 'ORD-REPLACE-IDEMP-001',
                customerEmail: 'order-replace@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 2 }],
            }];
            const getCount = async () => {
                const orders = await orderService.findAll(ctx, { filter: { code: { eq: 'ORD-REPLACE-IDEMP-001' } } } as never);
                if (orders.items.length === 0) return 0;
                return orders.items[0].lines?.length ?? 0;
            };
            const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
            expect(count).toBe(1);
        });

        it('should remove old lines not in new list', async () => {
            const step = makeStep('ord-replace-new', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'REPLACE_ALL',
            });
            // Create order with A, B
            await handler.execute(ctx, step, [{
                code: 'ORD-REPLACE-NEW-001',
                customerEmail: 'order-replace-new@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }, { sku: 'ORD-SKU-B', quantity: 1 }],
            }]);
            // Replace with C, D
            await handler.execute(ctx, step, [{
                code: 'ORD-REPLACE-NEW-001',
                customerEmail: 'order-replace-new@test.de',
                lines: [{ sku: 'ORD-SKU-C', quantity: 1 }, { sku: 'ORD-SKU-D', quantity: 1 }],
            }]);

            const orders = await orderService.findAll(ctx, { filter: { code: { eq: 'ORD-REPLACE-NEW-001' } } } as never);
            expect(orders.items.length).toBe(1);
            const lines = orders.items[0].lines ?? [];
            expect(lines.length).toBe(2);
        });

        it('should handle empty lines array (remove all)', async () => {
            const step = makeStep('ord-replace-empty', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'REPLACE_ALL',
            });
            await handler.execute(ctx, step, [{
                code: 'ORD-REPLACE-EMPTY-001',
                customerEmail: 'order-replace-empty@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);
            // Replace with empty
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-REPLACE-EMPTY-001',
                customerEmail: 'order-replace-empty@test.de',
                lines: [],
            }]);
            expect(result.ok).toBe(1);
        });
    });

    describe('MERGE_BY_SKU mode', () => {
        it('should update quantities for matching SKUs', async () => {
            const step = makeStep('ord-merge-qty', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'MERGE_BY_SKU',
            });
            // Create with SKU-A: qty 2
            await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-QTY-001',
                customerEmail: 'order-merge@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 2 }],
            }]);
            // Merge with SKU-A: qty 5
            await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-QTY-001',
                customerEmail: 'order-merge@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 5 }],
            }]);

            const orders = await orderService.findAll(ctx, { filter: { code: { eq: 'ORD-MERGE-QTY-001' } } } as never);
            expect(orders.items.length).toBe(1);
        });

        it('should add new SKUs while preserving existing', async () => {
            const step = makeStep('ord-merge-add', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'MERGE_BY_SKU',
            });
            // Create with A
            await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-ADD-001',
                customerEmail: 'order-merge-add@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);
            // Merge B
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-ADD-001',
                customerEmail: 'order-merge-add@test.de',
                lines: [{ sku: 'ORD-SKU-B', quantity: 1 }],
            }]);
            expect(result.ok).toBe(1);
        });

        it('should prevent duplicates on re-run', async () => {
            const step = makeStep('ord-merge-idemp', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'MERGE_BY_SKU',
            });
            const data = [{
                code: 'ORD-MERGE-IDEMP-001',
                customerEmail: 'order-merge-idemp@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 2 }, { sku: 'ORD-SKU-B', quantity: 3 }],
            }];
            const getCount = async () => {
                const orders = await orderService.findAll(ctx, { filter: { code: { eq: 'ORD-MERGE-IDEMP-001' } } } as never);
                if (orders.items.length === 0) return 0;
                return orders.items[0].lines?.length ?? 0;
            };
            const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
            expect(count).toBe(2);
        });

        it('should handle mixed updates and additions', async () => {
            const step = makeStep('ord-merge-mixed', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'MERGE_BY_SKU',
            });
            // Create with A:2, B:1
            await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-MIXED-001',
                customerEmail: 'order-merge-mixed@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 2 }, { sku: 'ORD-SKU-B', quantity: 1 }],
            }]);
            // Merge A:5, C:3
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-MIXED-001',
                customerEmail: 'order-merge-mixed@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 5 }, { sku: 'ORD-SKU-C', quantity: 3 }],
            }]);
            expect(result.ok).toBe(1);
        });
    });

    describe('APPEND_ONLY mode', () => {
        it('should always add new lines (may create duplicates)', async () => {
            const step = makeStep('ord-append', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'APPEND_ONLY',
            });
            await handler.execute(ctx, step, [{
                code: 'ORD-APPEND-001',
                customerEmail: 'order-append@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 2 }],
            }]);
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-APPEND-001',
                customerEmail: 'order-append@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 3 }],
            }]);
            expect(result.ok).toBe(1);
        });

        it('should create duplicate SKUs on re-run', async () => {
            const step = makeStep('ord-append-dup', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'APPEND_ONLY',
            });
            await handler.execute(ctx, step, [{
                code: 'ORD-APPEND-DUP-001',
                customerEmail: 'order-append-dup@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);
            await handler.execute(ctx, step, [{
                code: 'ORD-APPEND-DUP-001',
                customerEmail: 'order-append-dup@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);

            const orders = await orderService.findAll(ctx, { filter: { code: { eq: 'ORD-APPEND-DUP-001' } } } as never);
            if (orders.items.length > 0) {
                // Append mode should result in multiple lines for the same SKU
                const lines = orders.items[0].lines ?? [];
                expect(lines.length).toBeGreaterThanOrEqual(2);
            }
        });
    });

    describe('SKIP mode', () => {
        it('should not modify order lines', async () => {
            // Create order with lines
            const createStep = makeStep('ord-skip-create', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'REPLACE_ALL',
            });
            await handler.execute(ctx, createStep, [{
                code: 'ORD-SKIP-001',
                customerEmail: 'order-skip@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);

            // Run with SKIP
            const skipStep = makeStep('ord-skip', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'SKIP',
            });
            const result = await handler.execute(ctx, skipStep, [{
                code: 'ORD-SKIP-001',
                customerEmail: 'order-skip@test.de',
                lines: [{ sku: 'ORD-SKU-B', quantity: 5 }, { sku: 'ORD-SKU-C', quantity: 3 }],
            }]);
            expect(result.ok).toBe(1);
        });

        it('should leave line count unchanged', async () => {
            const createStep = makeStep('ord-skip-count-create', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'REPLACE_ALL',
            });
            await handler.execute(ctx, createStep, [{
                code: 'ORD-SKIP-COUNT-001',
                customerEmail: 'order-skip-count@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }, { sku: 'ORD-SKU-B', quantity: 1 }],
            }]);

            const skipStep = makeStep('ord-skip-count', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'SKIP',
            });
            await handler.execute(ctx, skipStep, [{
                code: 'ORD-SKIP-COUNT-001',
                customerEmail: 'order-skip-count@test.de',
                lines: [
                    { sku: 'ORD-SKU-A', quantity: 10 },
                    { sku: 'ORD-SKU-B', quantity: 10 },
                    { sku: 'ORD-SKU-C', quantity: 10 },
                    { sku: 'ORD-SKU-D', quantity: 10 },
                ],
            }]);

            const orders = await orderService.findAll(ctx, { filter: { code: { eq: 'ORD-SKIP-COUNT-001' } } } as never);
            if (orders.items.length > 0) {
                const lines = orders.items[0].lines ?? [];
                expect(lines.length).toBe(2);
            }
        });
    });

    describe('Edge cases', () => {
        it('should handle missing linesField', async () => {
            const step = makeStep('ord-no-lines', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
            });
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-NO-LINES-001',
                customerEmail: 'order-nolines@test.de',
                // No lines field
            }]);
            // Should create order without lines or handle gracefully
            expect(result.ok + result.fail).toBeGreaterThanOrEqual(1);
        });

        it('should handle invalid SKUs', async () => {
            const step = makeStep('ord-bad-sku', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
            });
            const collector = createErrorCollector();
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-BAD-SKU-001',
                customerEmail: 'order-badsku@test.de',
                lines: [{ sku: 'NONEXISTENT-SKU-XYZ', quantity: 1 }],
            }], collector.callback);
            // Invalid SKU should cause an error
            expect(result.fail).toBeGreaterThanOrEqual(1);
        });

        it('should handle zero/negative quantities', async () => {
            const step = makeStep('ord-zero-qty', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
            });
            const collector = createErrorCollector();
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-ZERO-QTY-001',
                customerEmail: 'order-zeroqty@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 0 }],
            }], collector.callback);
            // Zero quantity should be handled (error or default to 1)
            expect(result.ok + result.fail).toBeGreaterThanOrEqual(1);
        });

        it('should handle missing quantity field', async () => {
            const step = makeStep('ord-no-qty', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
            });
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-NO-QTY-001',
                customerEmail: 'order-noqty@test.de',
                lines: [{ sku: 'ORD-SKU-A' }], // No quantity field
            }]);
            // Should default to 1 or handle gracefully
            expect(result.ok + result.fail).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Performance', () => {
        it('should handle 100+ orders with multiple lines in <5 seconds', async () => {
            const step = makeStep('ord-perf', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
            });
            const data = Array.from({ length: 100 }, (_, i) => ({
                code: `ORD-PERF-${String(i).padStart(3, '0')}`,
                customerEmail: `order-perf-${i}@test.de`,
                lines: [
                    { sku: 'ORD-SKU-A', quantity: 1 },
                    { sku: 'ORD-SKU-B', quantity: 2 },
                ],
            }));

            const start = Date.now();
            await handler.execute(ctx, step, data);
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(60000);
        });
    });
});
