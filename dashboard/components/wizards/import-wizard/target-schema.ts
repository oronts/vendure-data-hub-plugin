import type {
    EnhancedFieldDefinition,
    EnhancedSchemaDefinition,
    FieldType,
} from '../../../../shared/types';
import type { EntityFieldInfo } from '../../../hooks/api/use-entity-field-schemas';

const FIELD_TYPE_MAP: Readonly<Record<string, FieldType>> = {
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    DATE: 'datetime',
    ARRAY: 'array',
    OBJECT: 'object',
    RELATION: 'string',
    ASSET: 'string',
    MONEY: 'decimal',
    LOCALIZED_STRING: 'string',
    ID: 'string',
    ENUM: 'enum',
    JSON: 'json',
};

function toFieldDefinition(
    field: EntityFieldInfo,
    staticDefinition?: EnhancedFieldDefinition,
): EnhancedFieldDefinition {
    const backendType = FIELD_TYPE_MAP[field.type] ?? 'json';
    const children = field.children.filter(child => !child.readonly);
    const enumValues = field.validation?.enum?.filter(
        (value): value is string | number | boolean =>
            typeof value === 'string'
            || typeof value === 'number'
            || typeof value === 'boolean',
    );
    const stringValidation = backendType === 'string'
        ? {
            minLength: field.validation?.minLength ?? undefined,
            maxLength: field.validation?.maxLength ?? undefined,
            pattern: field.validation?.pattern ?? undefined,
        }
        : undefined;
    const numberValidation = backendType === 'number' || backendType === 'decimal'
        ? {
            min: field.validation?.min ?? undefined,
            max: field.validation?.max ?? undefined,
        }
        : undefined;

    return {
        ...staticDefinition,
        type: staticDefinition?.type ?? backendType,
        label: field.label,
        description: field.description ?? staticDefinition?.description,
        example: field.example ?? staticDefinition?.example,
        required: field.required,
        readonly: field.readonly,
        validation: stringValidation ?? numberValidation ?? staticDefinition?.validation,
        enum: enumValues?.length ? enumValues : staticDefinition?.enum,
        fields: children.length > 0
            ? Object.fromEntries(children.map(child => [
                child.key,
                toFieldDefinition(child, staticDefinition?.fields?.[child.key]),
            ]))
            : staticDefinition?.fields,
    };
}

function existingPrimaryKey(
    staticSchema: EnhancedSchemaDefinition | undefined,
    fields: Record<string, EnhancedFieldDefinition>,
): string | string[] | undefined {
    const key = staticSchema?.primaryKey;
    if (!key) return undefined;
    const keys = Array.isArray(key) ? key : [key];
    return keys.every(candidate => candidate in fields) ? key : undefined;
}

export function buildImportTargetSchema(
    entityCode: string,
    backendFields: EntityFieldInfo[],
    staticSchema?: EnhancedSchemaDefinition,
): EnhancedSchemaDefinition | undefined {
    if (backendFields.length === 0) {
        return staticSchema;
    }
    const writableFields = backendFields.filter(field => !field.readonly);
    if (writableFields.length === 0) {
        return undefined;
    }
    const fields = Object.fromEntries(writableFields.map(field => [
        field.key,
        toFieldDefinition(field, staticSchema?.fields[field.key]),
    ]));
    const lookupFields = writableFields
        .filter(field => field.lookupable)
        .map(field => field.key);

    return {
        ...staticSchema,
        $id: staticSchema?.$id ?? `loader-${entityCode}`,
        label: staticSchema?.label ?? entityCode,
        fields,
        primaryKey: existingPrimaryKey(staticSchema, fields)
            ?? (lookupFields.length === 1
                ? lookupFields[0]
                : lookupFields.length > 1
                    ? lookupFields
                    : undefined),
    };
}
