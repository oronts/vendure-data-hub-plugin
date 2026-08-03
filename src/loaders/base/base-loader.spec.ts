import { describe, expect, it, vi } from 'vitest';
import type { ID, RequestContext } from '@vendure/core';
import type {
    EntityFieldSchema,
    EntityValidationResult,
    LoaderContext,
    TargetOperation,
} from '../../types';
import { VendureEntityType } from '../../constants/enums';
import type { DataHubLogger } from '../../services/logger/datahub-logger';
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderExecutionState,
    LoaderMetadata,
} from './base-loader';

type TestRecord = { sku: string };
type TestEntity = { id: ID };

class TestEntityLoader extends BaseEntityLoader<TestRecord, TestEntity> {
    protected readonly logger = {
        error: vi.fn(),
    } as unknown as DataHubLogger;

    protected readonly metadata: LoaderMetadata = {
        entityType: VendureEntityType.PRODUCT,
        name: 'Test loader',
        description: 'Test loader',
        adapterCode: 'test',
        supportedOperations: ['UPSERT', 'CREATE', 'UPDATE'],
        lookupFields: ['sku'],
        requiredFields: ['sku'],
    };

    readonly executionStates = new Map<string, LoaderExecutionState | undefined>();
    readonly creationStates = new Map<string, LoaderExecutionState | undefined>();

    readonly findExisting = vi.fn(
        async (): Promise<ExistingEntityLookupResult<TestEntity> | null> => null,
    );

    readonly validate = vi.fn(
        async (
            _ctx: RequestContext,
            record: TestRecord,
            _operation: TargetOperation,
            executionState?: LoaderExecutionState,
        ): Promise<EntityValidationResult> => {
            this.executionStates.set(record.sku, executionState);
            return {
                valid: true,
                errors: [],
                warnings: [],
            };
        },
    );

    readonly createEntity = vi.fn(async (
        _context: LoaderContext,
        record: TestRecord,
        executionState?: LoaderExecutionState,
    ): Promise<ID> => {
        this.creationStates.set(record.sku, executionState);
        return 42;
    });
    readonly updateEntity = vi.fn(async (): Promise<void> => undefined);

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.PRODUCT,
            fields: [],
        };
    }

    protected getDuplicateErrorMessage(record: TestRecord): string {
        return `Duplicate ${record.sku}`;
    }
}

function createContext(
    operation: TargetOperation,
    options: LoaderContext['options'] = {},
): LoaderContext {
    return {
        ctx: {} as RequestContext,
        pipelineId: 1,
        runId: 2,
        operation,
        lookupFields: ['sku'],
        dryRun: false,
        options,
    };
}

describe('BaseEntityLoader operation safety', () => {
    it.each(['DELETE', 'MERGE'] as const)(
        'rejects unsupported %s before any entity work',
        async operation => {
            const loader = new TestEntityLoader();
            const records = [{ sku: 'one' }, { sku: 'two' }];

            const result = await loader.load(createContext(operation), records);

            expect(result).toMatchObject({
                succeeded: 0,
                failed: 2,
                created: 0,
                updated: 0,
                skipped: 0,
                affectedIds: [],
            });
            expect(result.errors).toHaveLength(2);
            expect(result.errors).toEqual(
                records.map(record => ({
                    record,
                    message: `Operation ${operation} is not supported for PRODUCT`,
                    code: 'UNSUPPORTED_OPERATION',
                    recoverable: false,
                })),
            );
            expect(loader.validate).not.toHaveBeenCalled();
            expect(loader.findExisting).not.toHaveBeenCalled();
            expect(loader.createEntity).not.toHaveBeenCalled();
            expect(loader.updateEntity).not.toHaveBeenCalled();
        },
    );

    it('preserves supported UPSERT behavior', async () => {
        const loader = new TestEntityLoader();
        const record = { sku: 'one' };

        const result = await loader.load(createContext('UPSERT'), [record]);

        expect(result).toMatchObject({
            succeeded: 1,
            failed: 0,
            created: 1,
            updated: 0,
            affectedIds: [42],
        });
        expect(loader.validate).toHaveBeenCalledOnce();
        expect(loader.findExisting).toHaveBeenCalledOnce();
        expect(loader.createEntity).toHaveBeenCalledOnce();
        expect(loader.updateEntity).not.toHaveBeenCalled();
    });

    it('isolates mutable execution state between concurrent loads', async () => {
        const loader = new TestEntityLoader();

        await Promise.all([
            loader.load(createContext('UPSERT'), [{ sku: 'first' }]),
            loader.load(createContext('UPSERT'), [{ sku: 'second' }]),
        ]);

        const firstState = loader.executionStates.get('first');
        const secondState = loader.executionStates.get('second');
        expect(firstState).toBeDefined();
        expect(secondState).toBeDefined();
        expect(firstState).not.toBe(secondState);
        expect(loader.creationStates.get('first')).toBe(firstState);
        expect(loader.creationStates.get('second')).toBe(secondState);
    });

    it('fails CREATE duplicates when skipping is not explicit', async () => {
        const loader = new TestEntityLoader();
        const record = { sku: 'one' };
        loader.findExisting.mockResolvedValue({ id: 99, entity: { id: 99 } });

        const result = await loader.load(createContext('CREATE'), [record]);

        expect(result).toMatchObject({
            succeeded: 0,
            failed: 1,
            created: 0,
            updated: 0,
            skipped: 0,
        });
        expect(result.errors).toEqual([{
            record,
            message: 'Duplicate one',
            code: 'DUPLICATE',
            recoverable: false,
        }]);
        expect(loader.createEntity).not.toHaveBeenCalled();
        expect(loader.updateEntity).not.toHaveBeenCalled();
    });

    it('skips CREATE duplicates only when requested', async () => {
        const loader = new TestEntityLoader();
        const record = { sku: 'one' };
        loader.findExisting.mockResolvedValue({ id: 99, entity: { id: 99 } });

        const result = await loader.load(
            createContext('CREATE', { skipDuplicates: true }),
            [record],
        );

        expect(result).toMatchObject({
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 1,
            errors: [],
        });
        expect(loader.createEntity).not.toHaveBeenCalled();
        expect(loader.updateEntity).not.toHaveBeenCalled();
    });

    it('fails UPDATE when the target entity does not exist', async () => {
        const loader = new TestEntityLoader();
        const record = { sku: 'missing' };
        loader.findExisting.mockResolvedValue(null);

        const result = await loader.load(createContext('UPDATE'), [record]);

        expect(result).toMatchObject({
            succeeded: 0,
            failed: 1,
            created: 0,
            updated: 0,
            skipped: 0,
        });
        expect(result.errors).toEqual([{
            record,
            message: 'Cannot update missing PRODUCT entity',
            code: 'NOT_FOUND',
            recoverable: false,
        }]);
        expect(loader.createEntity).not.toHaveBeenCalled();
        expect(loader.updateEntity).not.toHaveBeenCalled();
    });
});
