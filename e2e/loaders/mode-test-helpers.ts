/**
 * Shared test utilities for nested entity mode e2e tests.
 *
 * Provides helpers for idempotency testing, duplicate prevention,
 * and mode-specific behavior verification.
 */
import { INestApplication } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition } from '../../shared/types';

export interface RecordObject {
    [key: string]: unknown;
}

/**
 * Test that running a loader multiple times with the same data
 * does NOT create duplicates (idempotency verification).
 *
 * @param handler - The loader handler instance
 * @param ctx - RequestContext
 * @param step - Pipeline step config
 * @param data - Test data records
 * @param getEntityCount - Function to count entities after execution
 * @param iterations - Number of times to run (default: 10)
 * @returns The final entity count
 */
export async function testIdempotency<THandler extends { execute: Function }>(
    handler: THandler,
    ctx: RequestContext,
    step: PipelineStepDefinition,
    data: RecordObject[],
    getEntityCount: () => Promise<number>,
    iterations: number = 10,
): Promise<number> {
    const counts: number[] = [];

    for (let i = 0; i < iterations; i++) {
        await handler.execute(ctx, step, data);
        const count = await getEntityCount();
        counts.push(count);
    }

    // All counts should be identical (no growth = no duplicates)
    const uniqueCounts = new Set(counts);
    if (uniqueCounts.size !== 1) {
        throw new Error(
            `Idempotency test failed: entity count changed across runs. ` +
            `Counts: [${counts.join(', ')}]. Expected all identical.`
        );
    }

    return counts[0];
}

/**
 * Test that a specific mode prevents duplicates as expected.
 *
 * @param handler - The loader handler instance
 * @param ctx - RequestContext
 * @param step - Pipeline step config with mode
 * @param data - Test data records
 * @param expectedCount - Expected final entity count
 * @param getEntityCount - Function to count entities
 */
export async function testModePreventsDuplicates<THandler extends { execute: Function }>(
    handler: THandler,
    ctx: RequestContext,
    step: PipelineStepDefinition,
    data: RecordObject[],
    expectedCount: number,
    getEntityCount: () => Promise<number>,
): Promise<void> {
    // Run twice to test duplicate prevention
    await handler.execute(ctx, step, data);
    const countAfterFirst = await getEntityCount();

    await handler.execute(ctx, step, data);
    const countAfterSecond = await getEntityCount();

    if (countAfterSecond !== expectedCount) {
        throw new Error(
            `Mode duplicate prevention failed: expected ${expectedCount} entities, ` +
            `got ${countAfterSecond} (first run: ${countAfterFirst})`
        );
    }
}

/**
 * Test that REPLACE_ALL mode removes old entities and creates new ones.
 *
 * @param handler - The loader handler instance
 * @param ctx - RequestContext
 * @param step - Pipeline step config with REPLACE_ALL mode
 * @param initialData - Initial data to load
 * @param replacementData - New data to replace with
 * @param getEntityIds - Function to get entity IDs
 */
export async function testReplaceAllMode<THandler extends { execute: Function }>(
    handler: THandler,
    ctx: RequestContext,
    step: PipelineStepDefinition,
    initialData: RecordObject[],
    replacementData: RecordObject[],
    getEntityIds: () => Promise<string[]>,
): Promise<void> {
    // Load initial data
    await handler.execute(ctx, step, initialData);
    const initialIds = await getEntityIds();

    // Load replacement data
    await handler.execute(ctx, step, replacementData);
    const finalIds = await getEntityIds();

    // Verify old IDs were removed
    const keptOldIds = initialIds.filter(id => finalIds.includes(id));
    if (keptOldIds.length > 0) {
        throw new Error(
            `REPLACE_ALL mode failed: ${keptOldIds.length} old entities still present. ` +
            `Old IDs: [${initialIds.join(', ')}], Final IDs: [${finalIds.join(', ')}]`
        );
    }
}

/**
 * Test that MERGE mode combines old and new entities without duplicates.
 *
 * @param handler - The loader handler instance
 * @param ctx - RequestContext
 * @param step - Pipeline step config with MERGE mode
 * @param initialData - Initial data to load
 * @param additionalData - Additional data to merge
 * @param expectedTotalCount - Expected total count after merge
 * @param getEntityCount - Function to count entities
 */
export async function testMergeMode<THandler extends { execute: Function }>(
    handler: THandler,
    ctx: RequestContext,
    step: PipelineStepDefinition,
    initialData: RecordObject[],
    additionalData: RecordObject[],
    expectedTotalCount: number,
    getEntityCount: () => Promise<number>,
): Promise<void> {
    // Load initial data
    await handler.execute(ctx, step, initialData);
    const initialCount = await getEntityCount();

    // Merge additional data
    await handler.execute(ctx, step, additionalData);
    const finalCount = await getEntityCount();

    if (finalCount !== expectedTotalCount) {
        throw new Error(
            `MERGE mode failed: expected ${expectedTotalCount} total entities, ` +
            `got ${finalCount} (initial: ${initialCount})`
        );
    }
}

/**
 * Test that SKIP mode leaves entities unchanged.
 *
 * @param handler - The loader handler instance
 * @param ctx - RequestContext
 * @param step - Pipeline step config with SKIP mode
 * @param initialData - Initial data to load (with SKIP disabled)
 * @param skipModeStep - Step config with SKIP mode enabled
 * @param updateData - Data to attempt update with (should be skipped)
 * @param getEntitySnapshot - Function to get snapshot of entity state
 */
export async function testSkipMode<THandler extends { execute: Function }>(
    handler: THandler,
    ctx: RequestContext,
    step: PipelineStepDefinition,
    skipModeStep: PipelineStepDefinition,
    initialData: RecordObject[],
    updateData: RecordObject[],
    getEntitySnapshot: () => Promise<unknown>,
): Promise<void> {
    // Load initial data without SKIP mode
    await handler.execute(ctx, step, initialData);
    const initialSnapshot = await getEntitySnapshot();

    // Attempt update with SKIP mode enabled
    await handler.execute(ctx, skipModeStep, updateData);
    const finalSnapshot = await getEntitySnapshot();

    // Snapshot should be identical (no changes)
    if (JSON.stringify(initialSnapshot) !== JSON.stringify(finalSnapshot)) {
        throw new Error(
            `SKIP mode failed: entities were modified when they should have been skipped`
        );
    }
}

/**
 * Test that APPEND_ONLY mode always creates new entities (may create duplicates).
 *
 * @param handler - The loader handler instance
 * @param ctx - RequestContext
 * @param step - Pipeline step config with APPEND_ONLY mode
 * @param data - Test data records
 * @param getEntityCount - Function to count entities
 * @param iterations - Number of times to run (default: 3)
 */
export async function testAppendOnlyMode<THandler extends { execute: Function }>(
    handler: THandler,
    ctx: RequestContext,
    step: PipelineStepDefinition,
    data: RecordObject[],
    getEntityCount: () => Promise<number>,
    iterations: number = 3,
): Promise<void> {
    const counts: number[] = [];

    for (let i = 0; i < iterations; i++) {
        await handler.execute(ctx, step, data);
        const count = await getEntityCount();
        counts.push(count);
    }

    // Count should grow by data.length on each iteration
    for (let i = 1; i < counts.length; i++) {
        const expectedGrowth = data.length;
        const actualGrowth = counts[i] - counts[i - 1];
        if (actualGrowth !== expectedGrowth) {
            throw new Error(
                `APPEND_ONLY mode failed: expected count to grow by ${expectedGrowth}, ` +
                `got growth of ${actualGrowth}. Counts: [${counts.join(', ')}]`
            );
        }
    }
}

/**
 * Performance test: verify loader handles large batch in acceptable time.
 *
 * @param handler - The loader handler instance
 * @param ctx - RequestContext
 * @param step - Pipeline step config
 * @param dataGenerator - Function to generate N test records
 * @param recordCount - Number of records to process
 * @param maxDurationMs - Maximum acceptable duration (default: 5000ms)
 */
export async function testPerformance<THandler extends { execute: Function }>(
    handler: THandler,
    ctx: RequestContext,
    step: PipelineStepDefinition,
    dataGenerator: (count: number) => RecordObject[],
    recordCount: number = 100,
    maxDurationMs: number = 5000,
): Promise<number> {
    const data = dataGenerator(recordCount);

    const startTime = Date.now();
    await handler.execute(ctx, step, data);
    const duration = Date.now() - startTime;

    if (duration > maxDurationMs) {
        throw new Error(
            `Performance test failed: processed ${recordCount} records in ${duration}ms, ` +
            `exceeded max ${maxDurationMs}ms`
        );
    }

    return duration;
}

/**
 * Test edge case: empty array input
 */
export async function testEmptyArrayHandling<THandler extends { execute: Function }>(
    handler: THandler,
    ctx: RequestContext,
    step: PipelineStepDefinition,
    getEntityCount: () => Promise<number>,
): Promise<void> {
    const initialCount = await getEntityCount();

    await handler.execute(ctx, step, []);

    const finalCount = await getEntityCount();

    if (finalCount !== initialCount) {
        throw new Error(
            `Empty array handling failed: count changed from ${initialCount} to ${finalCount}`
        );
    }
}

/**
 * Test edge case: missing required fields
 */
export async function testMissingFieldsHandling<THandler extends { execute: Function }>(
    handler: THandler,
    ctx: RequestContext,
    step: PipelineStepDefinition,
    invalidData: RecordObject[],
    onRecordError?: (stepKey: string, message: string, record: RecordObject) => Promise<void>,
): Promise<void> {
    const result = await handler.execute(ctx, step, invalidData, onRecordError);

    // Should report errors for invalid records
    if (result.fail === 0) {
        throw new Error(
            `Missing fields handling failed: expected errors for invalid data, got ${result.fail} failures`
        );
    }
}
