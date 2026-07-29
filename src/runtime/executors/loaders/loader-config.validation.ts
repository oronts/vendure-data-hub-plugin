import { LoadStrategy } from '../../../constants/enums';

const UPSERT_STRATEGIES = new Set<LoadStrategy>([
    LoadStrategy.CREATE,
    LoadStrategy.UPDATE,
    LoadStrategy.UPSERT,
]);

export function parseUpsertStrategy(value: unknown): LoadStrategy | undefined {
    if (value === undefined) return undefined;
    if (!UPSERT_STRATEGIES.has(value as LoadStrategy)) {
        throw new Error(`Unsupported load strategy "${String(value)}"`);
    }
    return value as LoadStrategy;
}

export function parseOptionalBoolean(
    value: unknown,
    fieldName: string,
): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') {
        throw new Error(`${fieldName} must be a boolean`);
    }
    return value;
}
