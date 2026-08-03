import { FIELD_LIMITS } from '../../constants/validation';
import { BATCH } from '../../../shared/constants';
import type { OnRecordErrorCallback, RecordObject } from '../executor-types';
import { resolveBoundedInteger } from '../execution-config';

export type SinkOperation = 'UPSERT' | 'DELETE';

interface PartitionedSinkRecords {
    upsertRecords: RecordObject[];
    deleteRecords: RecordObject[];
    invalid: number;
}

export function resolveSinkBatchSize(value: unknown): number {
    return resolveBoundedInteger(value, {
        fieldName: 'Sink batchSize',
        defaultValue: BATCH.BULK_SIZE,
        minimum: FIELD_LIMITS.BATCH_SIZE_MIN,
        maximum: FIELD_LIMITS.BATCH_SIZE_MAX,
    });
}

export function resolveSinkOperation(value: unknown, fieldName: string): SinkOperation {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be UPSERT or DELETE`);
    }
    const operation = value.trim().toUpperCase();
    if (operation !== 'UPSERT' && operation !== 'DELETE') {
        throw new Error(`${fieldName} must be UPSERT or DELETE`);
    }
    return operation;
}

export async function partitionSinkRecords(
    records: RecordObject[],
    defaultOperationValue: unknown,
    stepKey: string,
    onRecordError?: OnRecordErrorCallback,
): Promise<PartitionedSinkRecords> {
    const defaultOperation = resolveSinkOperation(defaultOperationValue, 'Sink defaultOperation');
    const upsertRecords: RecordObject[] = [];
    const deleteRecords: RecordObject[] = [];
    let invalid = 0;

    for (const record of records) {
        const hasRecordOperation = Object.prototype.hasOwnProperty.call(record, '__operation');
        let operation: SinkOperation;
        try {
            operation = hasRecordOperation
                ? resolveSinkOperation(record.__operation, 'Record __operation')
                : defaultOperation;
        } catch (error) {
            invalid++;
            if (onRecordError) {
                await onRecordError(
                    stepKey,
                    error instanceof Error ? error.message : 'Record __operation is invalid',
                    record,
                );
            }
            continue;
        }

        const cleanRecord = { ...record };
        delete cleanRecord.__operation;
        if (operation === 'DELETE') {
            deleteRecords.push(cleanRecord);
        } else {
            upsertRecords.push(cleanRecord);
        }
    }

    return { upsertRecords, deleteRecords, invalid };
}
