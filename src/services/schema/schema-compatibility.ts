import type {
    JsonObject,
    JsonValue,
    SchemaCompatibility,
} from '../../types';

interface ComparableField {
    readonly type?: string;
    readonly required: boolean;
    readonly nullable: boolean;
    readonly enumValues?: readonly JsonValue[];
    readonly minimum?: number;
    readonly maximum?: number;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: string;
    readonly fields?: Readonly<Record<string, ComparableField>>;
    readonly items?: ComparableField;
}

export function assertCompatibleSchemaEvolution(
    previous: JsonObject,
    next: JsonObject,
    compatibility: SchemaCompatibility,
): void {
    if (compatibility === 'PERMISSIVE') return;
    if (compatibility === 'STRICT') {
        if (canonicalJson(previous) !== canonicalJson(next)) {
            throw new Error(
                'STRICT compatibility requires the new schema definition to match the previous version exactly',
            );
        }
        return;
    }

    const issues: string[] = [];
    compareFields(
        extractFields(previous),
        extractFields(next),
        '$',
        issues,
    );
    if (issues.length > 0) {
        throw new Error(
            `Schema is not backward compatible with the previous version: ${issues.join('; ')}`,
        );
    }
}

function extractFields(
    definition: Record<string, unknown>,
): Readonly<Record<string, ComparableField>> {
    return normalizeFields(asRecord(definition.fields) ?? {});
}

function normalizeFields(
    fields: Record<string, unknown>,
): Readonly<Record<string, ComparableField>> {
    return Object.fromEntries(Object.entries(fields).flatMap(([name, raw]) => {
        const schema = asRecord(raw);
        if (!schema) return [];
        return [[name, normalizeField(schema)]];
    }));
}

function normalizeField(
    schema: Record<string, unknown>,
): ComparableField {
    const constraints = asRecord(schema.validation) ?? {};
    const nested = asRecord(schema.fields);
    const items = asRecord(schema.items);
    return {
        type: normalizeType(typeof schema.type === 'string' ? schema.type : undefined),
        required: schema.required === true,
        nullable: schema.nullable === true || schema.type === 'null',
        enumValues: Array.isArray(schema.enum) ? schema.enum as JsonValue[] : undefined,
        minimum: asNumber(constraints.min ?? constraints.minimum),
        maximum: asNumber(constraints.max ?? constraints.maximum),
        minLength: asNumber(constraints.minLength),
        maxLength: asNumber(constraints.maxLength),
        pattern: typeof constraints.pattern === 'string' ? constraints.pattern : undefined,
        fields: nested
            ? normalizeFields(nested)
            : undefined,
        items: items ? normalizeField(items) : undefined,
    };
}

function compareFields(
    previous: Readonly<Record<string, ComparableField>>,
    next: Readonly<Record<string, ComparableField>>,
    path: string,
    issues: string[],
): void {
    for (const [name, nextField] of Object.entries(next)) {
        const previousField = previous[name];
        const fieldPath = `${path}.${name}`;
        if (!previousField) {
            if (nextField.required) issues.push(`${fieldPath} is a new required field`);
            continue;
        }
        compareField(previousField, nextField, fieldPath, issues);
    }
}

function compareField(
    previous: ComparableField,
    next: ComparableField,
    path: string,
    issues: string[],
): void {
    if (!previous.required && next.required) issues.push(`${path} became required`);
    if (previous.nullable && !next.nullable) issues.push(`${path} no longer accepts null`);
    if (previous.type !== next.type) {
        issues.push(`${path} changed type from ${previous.type} to ${next.type}`);
    }
    compareLowerBound(previous.minimum, next.minimum, path, 'minimum', issues);
    compareUpperBound(previous.maximum, next.maximum, path, 'maximum', issues);
    compareLowerBound(previous.minLength, next.minLength, path, 'minLength', issues);
    compareUpperBound(previous.maxLength, next.maxLength, path, 'maxLength', issues);
    if (next.pattern && next.pattern !== previous.pattern) {
        issues.push(`${path} added or changed its pattern`);
    }
    if (next.enumValues && !containsAll(next.enumValues, previous.enumValues)) {
        issues.push(`${path} removed accepted enum values`);
    }
    if (previous.fields && next.fields) {
        compareFields(previous.fields, next.fields, path, issues);
    }
    if (previous.items && next.items) {
        compareField(previous.items, next.items, `${path}[]`, issues);
    }
}

function compareLowerBound(
    previous: number | undefined,
    next: number | undefined,
    path: string,
    label: string,
    issues: string[],
): void {
    if (next !== undefined && (previous === undefined || next > previous)) {
        issues.push(`${path} narrowed ${label}`);
    }
}

function compareUpperBound(
    previous: number | undefined,
    next: number | undefined,
    path: string,
    label: string,
    issues: string[],
): void {
    if (next !== undefined && (previous === undefined || next < previous)) {
        issues.push(`${path} narrowed ${label}`);
    }
}

function containsAll(
    next: readonly JsonValue[],
    previous: readonly JsonValue[] | undefined,
): boolean {
    if (!previous) return false;
    return previous.every(value => next.some(candidate => (
        canonicalJson(candidate) === canonicalJson(value)
    )));
}

function normalizeType(type: string | undefined): string | undefined {
    if (!type) return undefined;
    if (type === 'text') return 'string';
    if (['float', 'number'].includes(type)) return 'number';
    return type;
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const record = asRecord(value);
    if (record) {
        return `{${Object.keys(record).sort().map(key => (
            `${JSON.stringify(key)}:${canonicalJson(record[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
