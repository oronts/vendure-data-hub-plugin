import * as React from 'react';
import { useCallback, useMemo } from 'react';
import { Label } from '@vendure/dashboard';
import type { AdapterSchemaField, SchemaFieldType, SchemaFormRendererProps } from '../../../types';
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

        switch (fieldType) {
            case 'string':
            case 'text':
            case 'password':
            case 'email':
            case 'url':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <StringField field={field} value={value as string} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );

            case 'number':
            case 'int':
            case 'float':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <NumberField field={field} value={value as number | undefined} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );

            case 'boolean':
                return (
                    <div key={field.key} className={compact ? 'py-1' : 'py-2'}>
                        <div className="flex items-center justify-between">
                            <Label htmlFor={field.key} className={compact ? 'text-xs font-medium' : 'text-sm font-medium'}>
                                {field.label || field.key}
                                {field.required && <span className="text-destructive ml-0.5">*</span>}
                            </Label>
                            <BooleanField field={field} value={value as boolean} onChange={(v) => handleFieldChange(field.key, v)} disabled={readOnly} />
                        </div>
                        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                    </div>
                );

            case 'select':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <SelectField field={field} value={value as string} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );

            case 'secret':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <ReferenceField field={field} value={value as string} onChange={(v) => handleFieldChange(field.key, v)} options={secretCodes} placeholder="Select secret..." compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );

            case 'connection':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <ReferenceField field={field} value={value as string} onChange={(v) => handleFieldChange(field.key, v)} options={connectionCodes} placeholder="Select connection..." compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );

            case 'json':
            case 'object':
            case 'array':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <JsonField field={field} value={value} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );

            case 'textarea':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <TextareaField field={field} value={value as string} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );

            case 'code':
            case 'expression':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <TextareaField field={field} value={value as string} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} isCode />
                    </FieldWrapper>
                );

            case 'entity':
                if (field.options && field.options.length > 0) {
                    return (
                        <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                            <SelectField field={field} value={value as string} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                        </FieldWrapper>
                    );
                }
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <StringField field={field} value={String(value ?? field.default ?? '')} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );

            case 'file':
            case 'fileupload':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <FileUploadField field={field} value={value as string | undefined} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );

            default:
                if (field.options && field.options.length > 0) {
                    return (
                        <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                            <SelectField field={field} value={value as string} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                        </FieldWrapper>
                    );
                }
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <StringField field={field} value={String(value ?? field.default ?? '')} onChange={(v) => handleFieldChange(field.key, v)} compact={compact} disabled={readOnly} />
                    </FieldWrapper>
                );
        }
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
