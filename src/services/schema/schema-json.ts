export type SchemaNode = Record<string, unknown>;

export function numericConstraint(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function isPlainObject(value: unknown): value is SchemaNode {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function isJsonPrimitive(value: unknown): boolean {
    return value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || typeof value === 'number' && Number.isFinite(value);
}
