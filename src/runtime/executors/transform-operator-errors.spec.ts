import { describe, expect, it, vi } from 'vitest';
import { StepType } from '../../constants/enums';
import type { DataHubLoggerFactory } from '../../services/logger';
import type { ExecutorContext } from '../executor-types';
import { TransformExecutor } from './transform.executor';

function createFixture() {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const executor = new TransformExecutor({
        createLogger: vi.fn(() => logger),
    } as unknown as DataHubLoggerFactory);
    const executorContext: ExecutorContext = {
        cpData: {},
        cpDirty: false,
        markCheckpointDirty: vi.fn(),
    };
    return { executor, executorContext, logger };
}

describe('TransformExecutor operator errors', () => {
    it('fails a chained operator step when failOnError is enabled', async () => {
        const { executor, executorContext } = createFixture();

        await expect(executor.executeOperator({} as never, {
            key: 'transform',
            type: StepType.TRANSFORM,
            config: {
                operators: [{
                    op: 'script',
                    args: { failOnError: true },
                }],
            },
        }, [{ id: 'record-1' }], executorContext)).rejects.toThrow(
            'Script code is required',
        );
    });

    it('keeps records and logs recoverable operator errors', async () => {
        const { executor, executorContext, logger } = createFixture();
        const records = [{ id: 'record-1' }];

        await expect(executor.executeOperator({} as never, {
            key: 'transform',
            type: StepType.TRANSFORM,
            config: {
                adapterCode: 'script',
            },
        }, records, executorContext)).resolves.toEqual(records);

        expect(logger.warn).toHaveBeenCalledWith(
            'Operator completed with recoverable record errors',
            expect.objectContaining({
                operatorCode: 'script',
                errorCount: 1,
                firstError: 'Script code is required',
            }),
        );
    });
});
