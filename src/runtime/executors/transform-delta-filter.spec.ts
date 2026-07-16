import { describe, expect, it, vi } from 'vitest';
import { StepType } from '../../constants/enums';
import type { DataHubLoggerFactory } from '../../services/logger';
import type { PipelineStepDefinition } from '../../types';
import type { ExecutorContext } from '../executor-types';
import { TransformExecutor } from './transform.executor';

function createFixture() {
    const executor = new TransformExecutor({
        createLogger: vi.fn(() => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        })),
    } as unknown as DataHubLoggerFactory);
    const executorContext: ExecutorContext = {
        cpData: {},
        cpDirty: false,
        markCheckpointDirty: vi.fn(),
    };
    return { executor, executorContext };
}

describe('TransformExecutor deltaFilter checkpoints', () => {
    it('persists hashes and emits only new or changed records on later runs', async () => {
        const { executor, executorContext } = createFixture();
        const step: PipelineStepDefinition = {
            key: 'filter-products',
            type: StepType.TRANSFORM,
            config: {
                adapterCode: 'deltaFilter',
                idPath: 'sku',
                includePaths: ['name', 'price'],
            },
        };
        const initialRecords = [
            { sku: 'A', name: 'Alpha', price: 10 },
            { sku: 'B', name: 'Beta', price: 20 },
        ];

        await expect(executor.executeOperator(
            {} as never,
            step,
            initialRecords,
            executorContext,
        )).resolves.toEqual(initialRecords);

        await expect(executor.executeOperator(
            {} as never,
            step,
            initialRecords,
            executorContext,
        )).resolves.toEqual([]);

        const changedRecords = [
            { sku: 'A', name: 'Alpha updated', price: 10 },
            initialRecords[1],
        ];
        await expect(executor.executeOperator(
            {} as never,
            step,
            changedRecords,
            executorContext,
        )).resolves.toEqual([changedRecords[0]]);

        expect(executorContext.cpData?.['filter-products']).toEqual({
            __operatorCheckpoints: {
                'single:deltaFilter': {
                    A: expect.any(String),
                    B: expect.any(String),
                },
            },
        });
        expect(executorContext.markCheckpointDirty).toHaveBeenCalledTimes(3);
    });

    it('isolates checkpoints by step and operator position', async () => {
        const { executor, executorContext } = createFixture();
        const record = { sku: 'A', name: 'Alpha' };
        const createStep = (key: string) => ({
            key,
            type: StepType.TRANSFORM,
            config: {
                operators: [{
                    op: 'deltaFilter',
                    args: { idPath: 'sku' },
                }],
            },
        });

        await expect(executor.executeOperator(
            {} as never,
            createStep('first-step'),
            [record],
            executorContext,
        )).resolves.toEqual([record]);
        await expect(executor.executeOperator(
            {} as never,
            createStep('second-step'),
            [record],
            executorContext,
        )).resolves.toEqual([record]);

        expect(executorContext.cpData?.['first-step']?.__operatorCheckpoints).toEqual({
            'array:0:deltaFilter': { A: expect.any(String) },
        });
        expect(executorContext.cpData?.['second-step']?.__operatorCheckpoints).toEqual({
            'array:0:deltaFilter': { A: expect.any(String) },
        });
    });
});
