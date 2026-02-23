import * as React from 'react';
import { useCallback, useMemo } from 'react';
import { Label } from '@vendure/dashboard';
import type { AdapterSchemaField, SchemaFormRendererProps } from '../../../types';
import { normalizeFieldType } from './utils';
import {
    StringField,
    NumberField,
    BooleanField,
    SelectField,
    ReferenceField,
    JsonField,
    TextareaField,
    FileUploadField,
    FieldWrapper,
} from './fields';

/** Props passed to every field type renderer function in the registry. */
export interface FieldRendererProps {
    field: AdapterSchemaField;
    value: unknown;
    onChange: (value: unknown) => void;
    compact: boolean;
    disabled: boolean;
    error?: string;
    /** Secret codes available for reference fields. */
    secretCodes: string[];
    /** Connection codes available for reference fields. */
    connectionCodes: string[];
}

/** A render function that returns a React element for a given field type. */
export type FieldRendererFn = (props: FieldRendererProps) => React.ReactElement;

function wrapField(
    field: AdapterSchemaField,
    compact: boolean,
    error: string | undefined,
    child: React.ReactNode,
): React.ReactElement {
    return (
        <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
            {child}
        </FieldWrapper>
    );
}

const renderStringField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error }) =>
    wrapField(field, compact, error,
        <StringField field={field} value={value as string} onChange={onChange as (v: string) => void} compact={compact} disabled={disabled} />,
    );

const renderNumberField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error }) =>
    wrapField(field, compact, error,
        <NumberField field={field} value={value as number | undefined} onChange={onChange as (v: number | undefined) => void} compact={compact} disabled={disabled} />,
    );

const renderBooleanField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error }) => (
    <div key={field.key} className={compact ? 'py-1' : 'py-2'}>
        <div className="flex items-center justify-between">
            <Label htmlFor={field.key} className={compact ? 'text-xs font-medium' : 'text-sm font-medium'}>
                {field.label || field.key}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <BooleanField field={field} value={value as boolean} onChange={onChange as (v: boolean) => void} disabled={disabled} />
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
);

const renderSelectField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error }) =>
    wrapField(field, compact, error,
        <SelectField field={field} value={value as string} onChange={onChange as (v: string) => void} compact={compact} disabled={disabled} />,
    );

const renderSecretField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error, secretCodes }) =>
    wrapField(field, compact, error,
        <ReferenceField field={field} value={value as string} onChange={onChange as (v: string) => void} options={secretCodes} placeholder="Select secret..." compact={compact} disabled={disabled} />,
    );

const renderConnectionField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error, connectionCodes }) =>
    wrapField(field, compact, error,
        <ReferenceField field={field} value={value as string} onChange={onChange as (v: string) => void} options={connectionCodes} placeholder="Select connection..." compact={compact} disabled={disabled} />,
    );

const renderJsonField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error }) =>
    wrapField(field, compact, error,
        <JsonField field={field} value={value} onChange={onChange} compact={compact} disabled={disabled} />,
    );

const renderTextareaField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error }) =>
    wrapField(field, compact, error,
        <TextareaField field={field} value={value as string} onChange={onChange as (v: string) => void} compact={compact} disabled={disabled} />,
    );

const renderCodeField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error }) =>
    wrapField(field, compact, error,
        <TextareaField field={field} value={value as string} onChange={onChange as (v: string) => void} compact={compact} disabled={disabled} isCode />,
    );

const renderEntityField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error }) => {
    if (field.options && field.options.length > 0) {
        return wrapField(field, compact, error,
            <SelectField field={field} value={value as string} onChange={onChange as (v: string) => void} compact={compact} disabled={disabled} />,
        );
    }
    return wrapField(field, compact, error,
        <StringField field={field} value={String(value ?? field.default ?? '')} onChange={onChange as (v: string) => void} compact={compact} disabled={disabled} />,
    );
};

const renderFileUploadField: FieldRendererFn = ({ field, value, onChange, compact, disabled, error }) =>
    wrapField(field, compact, error,
        <FileUploadField field={field} value={value as string | undefined} onChange={onChange as (v: string | undefined) => void} compact={compact} disabled={disabled} />,
    );

/**
 * Registry mapping normalized field type strings to render functions.
 * Exported so custom dashboards can add entries for custom field types.
 */
export const FIELD_TYPE_RENDERERS: Record<string, FieldRendererFn> = {
    string: renderStringField,
    text: renderStringField,
    password: renderStringField,
    email: renderStringField,
    url: renderStringField,
    number: renderNumberField,
    int: renderNumberField,
    float: renderNumberField,
    boolean: renderBooleanField,
    select: renderSelectField,
    secret: renderSecretField,
    connection: renderConnectionField,
    json: renderJsonField,
    object: renderJsonField,
    array: renderJsonField,
    textarea: renderTextareaField,
    code: renderCodeField,
    expression: renderCodeField,
    entity: renderEntityField,
    file: renderFileUploadField,
    fileupload: renderFileUploadField,
};

function evaluateDependency(
    dependsOn: AdapterSchemaField['dependsOn'] | undefined,
    values: Record<string, unknown>
): boolean {
    if (!dependsOn) return true;

    const fieldValue = values[dependsOn.field];
    const targetValue = dependsOn.value;
    const operator = dependsOn.operator ?? 'eq';

    switch (operator) {
        case 'eq':
            return fieldValue === targetValue;
        case 'ne':
            return fieldValue !== targetValue;
        case 'in':
            return Array.isArray(targetValue) && targetValue.includes(fieldValue);
        case 'exists':
            return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
        default:
            return true;
    }
}

export function SchemaFormRenderer({
    schema,
    values,
    onChange,
    errors = {},
    readOnly = false,
    hideOptional = false,
    secretCodes = [],
    connectionCodes = [],
    compact = false,
}: SchemaFormRendererProps) {
    const visibleFields = useMemo(() => {
        if (!schema?.fields) return [];
        return schema.fields.filter((field) => {
            if (field.hidden) return false;
            if (hideOptional && !field.required && !field.advanced) return false;
            if (!evaluateDependency(field.dependsOn, values)) return false;
            return true;
        });
    }, [schema?.fields, values, hideOptional]);

    const groupedFields = useMemo(() => {
        const groups: Record<string, AdapterSchemaField[]> = { _default: [] };
        for (const field of visibleFields) {
            const groupName = field.group || '_default';
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(field);
        }
        return groups;
    }, [visibleFields]);

    const handleFieldChange = useCallback((key: string, value: unknown) => {
        onChange({ ...values, [key]: value });
    }, [onChange, values]);

    const renderField = (field: AdapterSchemaField) => {
        const value = values[field.key];
        const error = errors[field.key];
        const fieldType = normalizeFieldType(field.type);

        const rendererProps: FieldRendererProps = {
            field,
            value,
            onChange: (v: unknown) => handleFieldChange(field.key, v),
            compact,
            disabled: readOnly,
            error,
            secretCodes,
            connectionCodes,
        };

        const renderer = FIELD_TYPE_RENDERERS[fieldType];
        if (renderer) {
            return renderer(rendererProps);
        }

        // Fallback for unknown types: select if options exist, otherwise string input
        if (field.options && field.options.length > 0) {
            return renderSelectField(rendererProps);
        }
        return renderStringField({ ...rendererProps, value: String(value ?? field.default ?? '') });
    };

    return (
        <div className={compact ? 'space-y-2' : 'space-y-4'}>
            {Object.entries(groupedFields).map(([groupName, fields]) => (
                <div key={groupName} className={compact ? 'space-y-2' : 'space-y-4'}>
                    {groupName !== '_default' && (
                        <h4 className="text-sm font-medium text-muted-foreground border-b pb-2 capitalize">
                            {groupName.replace(/-/g, ' ')}
                        </h4>
                    )}
                    <div className={groupName !== '_default' ? 'pl-2 border-l-2 space-y-3' : ''}>
                        {fields.map(renderField)}
                    </div>
                </div>
            ))}
        </div>
    );
}
