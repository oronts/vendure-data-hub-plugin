import { SANDBOX } from '../../constants';

export function normalizeDryRunRecordLimit(recordLimit?: number): number {
    const value = recordLimit ?? SANDBOX.MAX_RECORDS;
    if (
        !Number.isSafeInteger(value)
        || value < 1
        || value > SANDBOX.MAX_RECORDS
    ) {
        throw new Error(
            `recordLimit must be an integer from 1 to ${SANDBOX.MAX_RECORDS}`,
        );
    }
    return value;
}
