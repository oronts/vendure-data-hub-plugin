import { RESOLVER_ERROR_MESSAGES, RETENTION } from '../../constants';

export function normalizeRetentionDays(
    field: string,
    value: number,
): number;
export function normalizeRetentionDays(
    field: string,
    value: number | null,
): number | null;
export function normalizeRetentionDays(
    field: string,
    value: number | undefined,
): number | undefined;
export function normalizeRetentionDays(
    field: string,
    value: number | null | undefined,
): number | null | undefined {
    if (value === null || value === undefined) {
        return value;
    }
    if (
        !Number.isInteger(value)
        || value < RETENTION.MIN_DAYS
        || value > RETENTION.MAX_DAYS
    ) {
        throw new Error(RESOLVER_ERROR_MESSAGES.INVALID_RETENTION_DAYS(
            field,
            RETENTION.MIN_DAYS,
            RETENTION.MAX_DAYS,
        ));
    }
    return value;
}
