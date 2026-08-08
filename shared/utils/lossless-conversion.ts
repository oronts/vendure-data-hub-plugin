export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasOwn(record: UnknownRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

export function cloneValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(item => cloneValue(item)) as T;
    }
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
        ) as T;
    }
    return value;
}

function encodeIdentity(value: unknown): string {
    if (value === undefined) {
        return 'u';
    }
    if (value === null) {
        return 'l';
    }
    if (typeof value === 'string') {
        return `s:${JSON.stringify(value)}`;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? `n:${value}` : `n:${String(value)}`;
    }
    if (typeof value === 'boolean') {
        return value ? 'b:1' : 'b:0';
    }
    if (Array.isArray(value)) {
        return `a:[${value.map(item => encodeIdentity(item)).join(',')}]`;
    }
    if (isRecord(value)) {
        return `o:{${Object.keys(value)
            .sort()
            .map(key => `${JSON.stringify(key)}:${encodeIdentity(value[key])}`)
            .join(',')}}`;
    }
    return `x:${typeof value}:${String(value)}`;
}

export function stableIdentity(value: unknown): string {
    return encodeIdentity(value);
}

export function valuesEqual(left: unknown, right: unknown): boolean {
    return stableIdentity(left) === stableIdentity(right);
}

export function mergeEditedValue(source: unknown, baseline: unknown, current: unknown): unknown {
    if (valuesEqual(current, baseline)) {
        return cloneValue(source);
    }
    if (!isRecord(baseline) || !isRecord(current)) {
        return cloneValue(current);
    }

    const result: UnknownRecord = isRecord(source) ? cloneValue(source) : {};
    const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
    for (const key of keys) {
        if (!hasOwn(current, key)) {
            continue;
        }
        if (current[key] === undefined) {
            delete result[key];
            continue;
        }
        result[key] = hasOwn(baseline, key)
            ? mergeEditedValue(result[key], baseline[key], current[key])
            : cloneValue(current[key]);
    }
    return result;
}
