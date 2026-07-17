/**
 * Order Lines Mode E2E Tests
 *
 * Verifies exact REPLACE_ALL, MERGE_BY_SKU, APPEND_ONLY, and SKIP behavior,
 * plus validation edge cases and bulk performance.
 *
 * NOTE: Order creation requires products/variants AND customers to exist.
 * The OrderUpsertHandler bridges to the OrderLoader (BaseEntityLoader).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OrderService } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { OrderUpsertHandler } from '../../src/runtime/executors/loaders/order-upsert-handler';
import { ProductHandler } from '../../src/runtime/executors/loaders/product-handler';
import { CustomerHandler } from '../../src/runtime/executors/loaders/customer-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';

describe('Order Lines Mode', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let handler: OrderUpsertHandler;
    let orderService: OrderService;
    let ctx: import('@vendure/core').RequestContext;

    async function getLineQuantities(code: string): Promise<Record<string, number>> {
        const order = await orderService.findOneByCode(ctx, code, [
            'lines',
            'lines.productVariant',
        ]);
        if (!order) {
            throw new Error(`Order "${code}" not found`);
        }
        return Object.fromEntries(
            order.lines.map(line => [line.productVariant.sku, line.quantity]),
        );
    }

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
        const productResult = await productHandler.execute(ctx, productStep, [
            { name: 'Order Product A', slug: 'order-prod-a', sku: 'ORD-SKU-A', price: 10.00, stockOnHand: 1000 },
            { name: 'Order Product B', slug: 'order-prod-b', sku: 'ORD-SKU-B', price: 20.00, stockOnHand: 1000 },
            { name: 'Order Product C', slug: 'order-prod-c', sku: 'ORD-SKU-C', price: 30.00, stockOnHand: 1000 },
            { name: 'Order Product D', slug: 'order-prod-d', sku: 'ORD-SKU-D', price: 40.00, stockOnHand: 1000 },
        ]);
        expect(productResult).toEqual({ ok: 4, fail: 0, skipped: 0 });

        // Create customers that orders reference (OrderLoader requires existing customers)
        const customerHandler = server.app.get(CustomerHandler);
        const customerStep = makeStep('setup-order-customers', {
            strategy: 'UPSERT',
            emailField: 'email',
            firstNameField: 'firstName',
            lastNameField: 'lastName',
        });
        const testEmails = [
            'order-replace@test.de', 'order-replace-new@test.de', 'order-replace-empty@test.de',
            'order-merge@test.de', 'order-merge-add@test.de', 'order-merge-idemp@test.de',
            'order-merge-mixed@test.de', 'order-append@test.de', 'order-append-dup@test.de',
            'order-skip@test.de', 'order-skip-count@test.de', 'order-nolines@test.de',
            'order-badsku@test.de', 'order-zeroqty@test.de', 'order-noqty@test.de',
        ];
        const customerData = testEmails.map(email => ({
            email,
            firstName: 'Order',
            lastName: 'Test',
        }));
        // Also create performance test customers
        for (let i = 0; i < 100; i++) {
            customerData.push({
                email: `order-perf-${i}@test.de`,
                firstName: `Perf${i}`,
                lastName: 'Test',
            });
        }
        await customerHandler.execute(ctx, customerStep, customerData);
    });

    afterAll(async () => {
        await server.destroy();
    });

    describe('REPLACE_ALL mode', () => {
        it('should create and update order idempotently', async () => {
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
            // Run 3 times
            for (let i = 0; i < 3; i++) {
                const result = await handler.execute(ctx, step, data);
                expect(result.ok).toBe(1);
                expect(result.fail).toBe(0);
            }
            expect(await getLineQuantities('ORD-REPLACE-IDEMP-001')).toEqual({
                'ORD-SKU-A': 2,
            });
        });

        it('should update existing order on re-run', async () => {
            const step = makeStep('ord-replace-new', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'REPLACE_ALL',
            });
            // Create order with A, B
            const r1 = await handler.execute(ctx, step, [{
                code: 'ORD-REPLACE-NEW-001',
                customerEmail: 'order-replace-new@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }, { sku: 'ORD-SKU-B', quantity: 1 }],
            }]);
            expect(r1.ok).toBe(1);

            // Replace with C and D.
            const r2 = await handler.execute(ctx, step, [{
                code: 'ORD-REPLACE-NEW-001',
                customerEmail: 'order-replace-new@test.de',
                lines: [{ sku: 'ORD-SKU-C', quantity: 1 }, { sku: 'ORD-SKU-D', quantity: 1 }],
            }]);
            expect(r2.ok).toBe(1);

            expect(await getLineQuantities('ORD-REPLACE-NEW-001')).toEqual({
                'ORD-SKU-C': 1,
                'ORD-SKU-D': 1,
            });
        });

        it('should reject empty lines array on UPSERT (validation requires lines)', async () => {
            const step = makeStep('ord-replace-empty', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'REPLACE_ALL',
            });
            const r1 = await handler.execute(ctx, step, [{
                code: 'ORD-REPLACE-EMPTY-001',
                customerEmail: 'order-replace-empty@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);
            expect(r1.ok).toBe(1);

            // Empty lines on UPSERT: validation rejects the record because
            // requireArrayForCreate checks for UPSERT too, requiring non-empty lines
            const collector = createErrorCollector();
            const r2 = await handler.execute(ctx, step, [{
                code: 'ORD-REPLACE-EMPTY-001',
                customerEmail: 'order-replace-empty@test.de',
                lines: [],
            }], collector.callback);
            // Validation failure: "At least one order line is required"
            expect(r2.fail).toBe(1);
        });
    });

    describe('MERGE_BY_SKU mode', () => {
        it('should add imported quantity to an existing SKU', async () => {
            const step = makeStep('ord-merge-qty', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'MERGE_BY_SKU',
            });
            // Create with SKU-A: qty 2
            const r1 = await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-QTY-001',
                customerEmail: 'order-merge@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 2 }],
            }]);
            expect(r1.ok).toBe(1);

            // Merge another five units into the existing line.
            const r2 = await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-QTY-001',
                customerEmail: 'order-merge@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 5 }],
            }]);
            expect(r2.ok).toBe(1);
            expect(await getLineQuantities('ORD-MERGE-QTY-001')).toEqual({
                'ORD-SKU-A': 7,
            });
        });

        it('should retain existing SKUs and add new SKUs', async () => {
            const step = makeStep('ord-merge-add', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'MERGE_BY_SKU',
            });
            // Create with A
            const r1 = await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-ADD-001',
                customerEmail: 'order-merge-add@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);
            expect(r1.ok).toBe(1);

            // Merge B without removing A.
            const r2 = await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-ADD-001',
                customerEmail: 'order-merge-add@test.de',
                lines: [{ sku: 'ORD-SKU-B', quantity: 1 }],
            }]);
            expect(r2.ok).toBe(1);
            expect(await getLineQuantities('ORD-MERGE-ADD-001')).toEqual({
                'ORD-SKU-A': 1,
                'ORD-SKU-B': 1,
            });
        });

        it('should accumulate quantities on repeated imports', async () => {
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
            for (let i = 0; i < 3; i++) {
                const result = await handler.execute(ctx, step, data);
                expect(result.ok).toBe(1);
            }
            expect(await getLineQuantities('ORD-MERGE-IDEMP-001')).toEqual({
                'ORD-SKU-A': 6,
                'ORD-SKU-B': 9,
            });
        });

        it('should merge existing and new SKUs in one import', async () => {
            const step = makeStep('ord-merge-mixed', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'MERGE_BY_SKU',
            });
            // Create with A:2, B:1
            const r1 = await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-MIXED-001',
                customerEmail: 'order-merge-mixed@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 2 }, { sku: 'ORD-SKU-B', quantity: 1 }],
            }]);
            expect(r1.ok).toBe(1);

            // Add five A and three C while retaining B.
            const r2 = await handler.execute(ctx, step, [{
                code: 'ORD-MERGE-MIXED-001',
                customerEmail: 'order-merge-mixed@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 5 }, { sku: 'ORD-SKU-C', quantity: 3 }],
            }]);
            expect(r2.ok).toBe(1);
            expect(await getLineQuantities('ORD-MERGE-MIXED-001')).toEqual({
                'ORD-SKU-A': 7,
                'ORD-SKU-B': 1,
                'ORD-SKU-C': 3,
            });
        });
    });

    describe('APPEND_ONLY mode', () => {
        it('should preserve existing lines while appending new SKUs', async () => {
            const step = makeStep('ord-append', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'APPEND_ONLY',
            });
            const r1 = await handler.execute(ctx, step, [{
                code: 'ORD-APPEND-001',
                customerEmail: 'order-append@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 2 }],
            }]);
            expect(r1.ok).toBe(1);

            const r2 = await handler.execute(ctx, step, [{
                code: 'ORD-APPEND-001',
                customerEmail: 'order-append@test.de',
                lines: [{ sku: 'ORD-SKU-B', quantity: 3 }],
            }]);
            expect(r2.ok).toBe(1);
            expect(await getLineQuantities('ORD-APPEND-001')).toEqual({
                'ORD-SKU-A': 2,
                'ORD-SKU-B': 3,
            });
        });

        it('should handle re-runs without error', async () => {
            const step = makeStep('ord-append-dup', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'APPEND_ONLY',
            });
            const r1 = await handler.execute(ctx, step, [{
                code: 'ORD-APPEND-DUP-001',
                customerEmail: 'order-append-dup@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);
            expect(r1.ok).toBe(1);

            const r2 = await handler.execute(ctx, step, [{
                code: 'ORD-APPEND-DUP-001',
                customerEmail: 'order-append-dup@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);
            expect(r2.ok).toBe(1);

            expect(await getLineQuantities('ORD-APPEND-DUP-001')).toEqual({
                'ORD-SKU-A': 2,
            });
        });
    });

    describe('SKIP mode', () => {
        it('should leave existing lines unchanged', async () => {
            // Create order with lines
            const createStep = makeStep('ord-skip-create', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'REPLACE_ALL',
            });
            const r1 = await handler.execute(ctx, createStep, [{
                code: 'ORD-SKIP-001',
                customerEmail: 'order-skip@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }],
            }]);
            expect(r1.ok).toBe(1);

            const skipStep = makeStep('ord-skip', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'SKIP',
            });
            const r2 = await handler.execute(ctx, skipStep, [{
                code: 'ORD-SKIP-001',
                customerEmail: 'order-skip@test.de',
                lines: [{ sku: 'ORD-SKU-B', quantity: 5 }, { sku: 'ORD-SKU-C', quantity: 3 }],
            }]);
            expect(r2.ok).toBe(1);
            expect(await getLineQuantities('ORD-SKIP-001')).toEqual({
                'ORD-SKU-A': 1,
            });
        });

        it('should ignore any number of incoming lines', async () => {
            const createStep = makeStep('ord-skip-count-create', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'REPLACE_ALL',
            });
            const r1 = await handler.execute(ctx, createStep, [{
                code: 'ORD-SKIP-COUNT-001',
                customerEmail: 'order-skip-count@test.de',
                lines: [{ sku: 'ORD-SKU-A', quantity: 1 }, { sku: 'ORD-SKU-B', quantity: 1 }],
            }]);
            expect(r1.ok).toBe(1);

            const skipStep = makeStep('ord-skip-count', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
                linesMode: 'SKIP',
            });
            const r2 = await handler.execute(ctx, skipStep, [{
                code: 'ORD-SKIP-COUNT-001',
                customerEmail: 'order-skip-count@test.de',
                lines: [
                    { sku: 'ORD-SKU-A', quantity: 10 },
                    { sku: 'ORD-SKU-B', quantity: 10 },
                    { sku: 'ORD-SKU-C', quantity: 10 },
                    { sku: 'ORD-SKU-D', quantity: 10 },
                ],
            }]);
            expect(r2.ok).toBe(1);

            expect(await getLineQuantities('ORD-SKIP-COUNT-001')).toEqual({
                'ORD-SKU-A': 1,
                'ORD-SKU-B': 1,
            });
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
            const collector = createErrorCollector();
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-NO-LINES-001',
                customerEmail: 'order-nolines@test.de',
                // No lines field - validation requires lines for CREATE
            }], collector.callback);
            expect(result).toMatchObject({ ok: 0, fail: 1 });
            expect(collector.errors[0]?.message).toContain('At least one order line is required');
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
            expect(result).toMatchObject({ ok: 0, fail: 1 });
            expect(collector.errors[0]?.message).toContain('NONEXISTENT-SKU-XYZ');
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
            expect(result).toMatchObject({ ok: 0, fail: 1 });
            expect(collector.errors[0]?.message).toContain('quantity must be at least 1');
        });

        it('should handle missing quantity field', async () => {
            const step = makeStep('ord-no-qty', {
                strategy: 'UPSERT',
                codeField: 'code',
                customerEmailField: 'customerEmail',
                linesField: 'lines',
            });
            const collector = createErrorCollector();
            const result = await handler.execute(ctx, step, [{
                code: 'ORD-NO-QTY-001',
                customerEmail: 'order-noqty@test.de',
                lines: [{ sku: 'ORD-SKU-A' }], // No quantity field
            }], collector.callback);
            expect(result).toMatchObject({ ok: 0, fail: 1 });
            expect(collector.errors[0]?.message).toContain('quantity must be at least 1');
        });
    });

    describe('Performance', () => {
        it('should handle 100+ orders with multiple lines in <60 seconds', async () => {
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
