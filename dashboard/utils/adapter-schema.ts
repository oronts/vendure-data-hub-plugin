import type {
    AdapterSchema,
    AdapterSchemaField,
    JsonValue,
    SchemaFieldType,
} from '../../shared/types';

interface ApiSchemaField {
    key: string;
    label?: string | null;
    description?: string | null;
    type: string;
    required?: boolean | null;
    defaultValue?: unknown;
    placeholder?: string | null;
    options?: ReadonlyArray<{ value: string; label: string }> | null;
    group?: string | null;
    dependsOn?: {
        field: string;
        value: unknown;
        operator?: string | null;
    } | null;
    validation?: {
        min?: number | null;
        max?: number | null;
        minLength?: number | null;
        maxLength?: number | null;
        pattern?: string | null;
        patternMessage?: string | null;
    } | null;
}

interface ApiAdapterSchema {
    fields: ReadonlyArray<ApiSchemaField>;
    groups?: ReadonlyArray<{
        id: string;
        label: string;
        description?: string | null;
    }> | null;
}

const DEPENDENCY_OPERATORS = new Set(['eq', 'ne', 'in', 'notIn', 'exists']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSchema(schema: unknown): ApiAdapterSchema | null {
    let parsed = schema;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return null;
        }
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.fields)) {
        return null;
    }
    return parsed as unknown as ApiAdapterSchema;
}

function mapDependency(
    dependency: ApiSchemaField['dependsOn'],
): AdapterSchemaField['dependsOn'] {
    if (!dependency || typeof dependency.field !== 'string') {
        return undefined;
    }
    const operator = dependency.operator ?? 'eq';
    return {
        field: dependency.field,
        value: dependency.value as JsonValue,
        operator: DEPENDENCY_OPERATORS.has(operator)
            ? operator as NonNullable<AdapterSchemaField['dependsOn']>['operator']
            : 'eq',
    };
}

export function mapAdapterSchemaField(field: ApiSchemaField): AdapterSchemaField {
    const validation = field.validation
        ? {
            min: field.validation.min ?? undefined,
            max: field.validation.max ?? undefined,
            minLength: field.validation.minLength ?? undefined,
            maxLength: field.validation.maxLength ?? undefined,
            pattern: field.validation.pattern ?? undefined,
            patternMessage: field.validation.patternMessage ?? undefined,
        }
        : undefined;

    return {
        key: field.key,
        label: field.label ?? undefined,
        description: field.description ?? undefined,
        type: field.type.toLowerCase() as SchemaFieldType,
        required: field.required ?? undefined,
        default: field.defaultValue as JsonValue | undefined,
        options: field.options?.map(option => ({ ...option })) ?? undefined,
        placeholder: field.placeholder ?? undefined,
        validation,
        dependsOn: mapDependency(field.dependsOn),
        group: field.group ?? undefined,
    };
}

export function mapAdapterSchema(schema: unknown): AdapterSchema {
    const parsed = parseSchema(schema);
    if (!parsed) {
        return { fields: [] };
    }

    return {
        fields: parsed.fields
            .filter(field => isRecord(field) && typeof field.key === 'string' && typeof field.type === 'string')
            .map(field => mapAdapterSchemaField(field)),
        groups: parsed.groups?.map(group => ({
            key: group.id,
            label: group.label,
            description: group.description ?? undefined,
        })) ?? undefined,
    };
}
