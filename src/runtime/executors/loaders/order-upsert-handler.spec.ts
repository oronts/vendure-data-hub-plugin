import { describe, expect, it, vi } from 'vitest';
import { PipelineStepDefinition } from '../../../types';
import type { LinesMode } from '../../../../shared/types';
import { OrderUpsertHandler } from './order-upsert-handler';

function createStep(linesMode?: LinesMode): PipelineStepDefinition {
    return {
        key: 'load-orders',
        type: 'LOAD',
        config: {
            adapterCode: 'orderUpsert',
            strategy: 'UPSERT',
            ...(linesMode ? { linesMode } : {}),
        },
    } as PipelineStepDefinition;
}

describe('OrderUpsertHandler line modes', () => {
    it.each<LinesMode>(['REPLACE_ALL', 'MERGE_BY_SKU', 'APPEND_ONLY', 'SKIP'])(
        'propagates %s to OrderLoader options',
        async linesMode => {
            const load = vi.fn().mockResolvedValue({
                succeeded: 1,
                failed: 0,
                errors: [],
            });
            const handler = new OrderUpsertHandler({ load } as never);

            await handler.execute({} as never, createStep(linesMode), [{
                code: 'ORDER-1',
                customerEmail: 'customer@example.com',
                lines: [{ sku: 'SKU-1', quantity: 1 }],
            }]);

            expect(load).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: expect.objectContaining({
                        config: { linesMode },
                    }),
                }),
                expect.any(Array),
            );
        },
    );

    it('preserves OrderLoader defaults when no mode is configured', async () => {
        const load = vi.fn().mockResolvedValue({
            succeeded: 1,
            failed: 0,
            errors: [],
        });
        const handler = new OrderUpsertHandler({ load } as never);

        await handler.execute({} as never, createStep(), [{
            code: 'ORDER-1',
            customerEmail: 'customer@example.com',
            lines: [{ sku: 'SKU-1', quantity: 1 }],
        }]);

        expect(load).toHaveBeenCalledWith(
            expect.objectContaining({
                options: { skipDuplicates: false },
            }),
            expect.any(Array),
        );
    });
});
