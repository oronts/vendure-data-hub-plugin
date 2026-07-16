import { describe, expect, it, vi } from 'vitest';
import { StepType } from '../../constants/enums';
import type { DataHubLoggerFactory } from '../../services/logger';
import { TransformExecutor } from './transform.executor';

describe('TransformExecutor validate rule errors', () => {
    it('maps the rule error text into runtime field validation', async () => {
        const executor = new TransformExecutor({
            createLogger: vi.fn(() => ({
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            })),
        } as unknown as DataHubLoggerFactory);
        const onRecordError = vi.fn(async () => undefined);
        const record = { sku: '' };

        await expect(executor.executeValidate(
            {} as never,
            {
                key: 'validate-products',
                type: StepType.VALIDATE,
                config: {
                    rules: [{
                        type: 'FIELD',
                        spec: {
                            field: 'sku',
                            required: true,
                            error: 'A product SKU is required',
                        },
                    }],
                },
            },
            [record],
            onRecordError,
        )).resolves.toEqual([]);
        expect(onRecordError).toHaveBeenCalledWith(
            'validate-products',
            'A product SKU is required',
            record,
        );
    });
});
