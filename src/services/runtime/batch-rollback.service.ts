import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { BatchTransactionStatus, LOGGER_CONTEXTS, RollbackOperationType, BATCH_ROLLBACK } from '../../constants/index';
import { JsonObject } from '../../types/index';
import type { DeepPartial, ObjectLiteral } from 'typeorm';

interface RollbackableOperation {
    type: RollbackOperationType;
    entityType: string;
    entityId: string | number;
    previousState?: JsonObject;
    newState?: JsonObject;
}

interface BatchTransaction {
    id: string;
    operations: RollbackableOperation[];
    status: BatchTransactionStatus;
    startedAt: Date;
    completedAt?: Date;
}

@Injectable()
export class BatchRollbackService implements OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private transactions: Map<string, BatchTransaction> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(
        private readonly connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_RUNNER);

        // Start periodic cleanup of stale transactions to prevent memory leaks
        this.cleanupInterval = setInterval(
            () => this.cleanupStaleTransactions(),
            BATCH_ROLLBACK.CLEANUP_INTERVAL_MS,
        );
    }

    onModuleDestroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.transactions.clear();
    }

    /**
     * Clean up stale transactions that have been completed or are too old
     */
    private cleanupStaleTransactions(): void {
        const now = Date.now();
        const maxAgeMs = BATCH_ROLLBACK.MAX_TRANSACTION_AGE_MS;
        let cleaned = 0;

        for (const [id, tx] of this.transactions.entries()) {
            const age = now - tx.startedAt.getTime();
            const isCompleted = tx.status === BatchTransactionStatus.COMMITTED ||
                               tx.status === BatchTransactionStatus.ROLLED_BACK;
            const isStale = age > maxAgeMs;

            if (isCompleted || isStale) {
                this.transactions.delete(id);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug('Cleaned up stale batch transactions', { cleaned, remaining: this.transactions.size });
        }
    }

    startTransaction(): string {
        const id = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.transactions.set(id, {
            id,
            operations: [],
            status: BatchTransactionStatus.PENDING,
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
            type: RollbackOperationType.CREATE,
            entityType,
            entityId,
            newState,
        });
    }

    recordUpdate(transactionId: string, entityType: string, entityId: string | number, previousState: JsonObject, newState: JsonObject): void {
        this.recordOperation(transactionId, {
            type: RollbackOperationType.UPDATE,
            entityType,
            entityId,
            previousState,
            newState,
        });
    }

    recordDelete(transactionId: string, entityType: string, entityId: string | number, previousState: JsonObject): void {
        this.recordOperation(transactionId, {
            type: RollbackOperationType.DELETE,
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
        tx.status = BatchTransactionStatus.COMMITTED;
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

        tx.status = failed > 0 ? BatchTransactionStatus.PARTIAL_ROLLBACK : BatchTransactionStatus.ROLLED_BACK;
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
            case RollbackOperationType.CREATE:
                // For create operations, delete the entity
                await repo.delete(op.entityId);
                break;

            case RollbackOperationType.UPDATE:
                // For update operations, restore previous state
                // Note: Cast required because TypeORM expects specific entity types,
                // but we're working with dynamic entity types resolved at runtime
                if (op.previousState) {
                    await repo.update(op.entityId, op.previousState as DeepPartial<ObjectLiteral>);
                }
                break;

            case RollbackOperationType.DELETE:
                // For delete operations, recreate the entity
                // Note: Cast required because TypeORM expects specific entity types,
                // but we're working with dynamic entity types resolved at runtime
                if (op.previousState) {
                    await repo.save({ ...op.previousState, id: op.entityId } as DeepPartial<ObjectLiteral>);
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
        tx.status = failed > 0 ? BatchTransactionStatus.PARTIAL_ROLLBACK : BatchTransactionStatus.PENDING;

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
