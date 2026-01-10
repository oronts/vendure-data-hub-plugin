import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { JsonObject } from '../../types/index';

export interface RollbackableOperation {
    type: 'create' | 'update' | 'delete';
    entityType: string;
    entityId: string | number;
    previousState?: JsonObject;
    newState?: JsonObject;
}

export interface BatchTransaction {
    id: string;
    operations: RollbackableOperation[];
    status: 'pending' | 'committed' | 'rolled_back' | 'partial_rollback';
    startedAt: Date;
    completedAt?: Date;
}

@Injectable()
export class BatchRollbackService {
    private readonly logger: DataHubLogger;
    private transactions: Map<string, BatchTransaction> = new Map();

    constructor(
        private readonly connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_RUNNER);
    }

    startTransaction(): string {
        const id = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.transactions.set(id, {
            id,
            operations: [],
            status: 'pending',
            startedAt: new Date(),
        });
        return id;
    }

    recordOperation(transactionId: string, operation: RollbackableOperation): void {
        const tx = this.transactions.get(transactionId);
        if (!tx) {
            this.logger.warn('Transaction not found for recording operation', { transactionId });
            return;
        }
        tx.operations.push(operation);
    }

    recordCreate(transactionId: string, entityType: string, entityId: string | number, newState?: JsonObject): void {
        this.recordOperation(transactionId, {
            type: 'create',
            entityType,
            entityId,
            newState,
        });
    }

    recordUpdate(transactionId: string, entityType: string, entityId: string | number, previousState: JsonObject, newState: JsonObject): void {
        this.recordOperation(transactionId, {
            type: 'update',
            entityType,
            entityId,
            previousState,
            newState,
        });
    }

    recordDelete(transactionId: string, entityType: string, entityId: string | number, previousState: JsonObject): void {
        this.recordOperation(transactionId, {
            type: 'delete',
            entityType,
            entityId,
            previousState,
        });
    }

    commit(transactionId: string): void {
        const tx = this.transactions.get(transactionId);
        if (!tx) {
            this.logger.warn('Transaction not found for commit', { transactionId });
            return;
        }
        tx.status = 'committed';
        tx.completedAt = new Date();
        this.logger.debug('Batch transaction committed', {
            transactionId,
            operationCount: tx.operations.length,
        });
    }

    async rollback(ctx: RequestContext, transactionId: string): Promise<{ rolled: number; failed: number }> {
        const tx = this.transactions.get(transactionId);
        if (!tx) {
            this.logger.warn('Transaction not found for rollback', { transactionId });
            return { rolled: 0, failed: 0 };
        }

        let rolled = 0;
        let failed = 0;

        // Process operations in reverse order
        const reversedOps = [...tx.operations].reverse();

        for (const op of reversedOps) {
            try {
                await this.rollbackOperation(ctx, op);
                rolled++;
            } catch (error) {
                failed++;
                this.logger.error('Failed to rollback operation', error instanceof Error ? error : new Error(String(error)), {
                    operation: op,
                });
            }
        }

        tx.status = failed > 0 ? 'partial_rollback' : 'rolled_back';
        tx.completedAt = new Date();

        this.logger.info('Batch rollback completed', {
            transactionId,
            rolled,
            failed,
            status: tx.status,
        });

        return { rolled, failed };
    }

    private async rollbackOperation(ctx: RequestContext, op: RollbackableOperation): Promise<void> {
        const entityMeta = this.connection.rawConnection.entityMetadatas.find(
            m => m.name === op.entityType || m.tableName === op.entityType
        );

        if (!entityMeta) {
            this.logger.warn('Entity metadata not found for rollback', { entityType: op.entityType });
            return;
        }

        const repo = this.connection.rawConnection.getRepository(entityMeta.target);

        switch (op.type) {
            case 'create':
                // For create operations, delete the entity
                await repo.delete(op.entityId);
                break;

            case 'update':
                // For update operations, restore previous state
                if (op.previousState) {
                    await repo.update(op.entityId, op.previousState as any);
                }
                break;

            case 'delete':
                // For delete operations, recreate the entity
                if (op.previousState) {
                    await repo.save({ ...op.previousState, id: op.entityId } as any);
                }
                break;
        }
    }

    async partialRollback(ctx: RequestContext, transactionId: string, fromIndex: number): Promise<{ rolled: number; failed: number }> {
        const tx = this.transactions.get(transactionId);
        if (!tx) {
            this.logger.warn('Transaction not found for partial rollback', { transactionId });
            return { rolled: 0, failed: 0 };
        }

        let rolled = 0;
        let failed = 0;

        // Only rollback operations from the given index onwards (in reverse)
        const opsToRollback = tx.operations.slice(fromIndex).reverse();

        for (const op of opsToRollback) {
            try {
                await this.rollbackOperation(ctx, op);
                rolled++;
            } catch (error) {
                failed++;
                this.logger.error('Failed to rollback operation', error instanceof Error ? error : new Error(String(error)), {
                    operation: op,
                });
            }
        }

        // Remove rolled back operations
        tx.operations = tx.operations.slice(0, fromIndex);
        tx.status = failed > 0 ? 'partial_rollback' : 'pending';

        this.logger.info('Partial rollback completed', {
            transactionId,
            fromIndex,
            rolled,
            failed,
            remainingOps: tx.operations.length,
        });

        return { rolled, failed };
    }

    cleanup(transactionId: string): void {
        this.transactions.delete(transactionId);
    }

    getTransaction(transactionId: string): BatchTransaction | undefined {
        return this.transactions.get(transactionId);
    }

    getOperationCount(transactionId: string): number {
        return this.transactions.get(transactionId)?.operations.length ?? 0;
    }
}
