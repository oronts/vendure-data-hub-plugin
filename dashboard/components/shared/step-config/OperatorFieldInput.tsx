import * as React from 'react';
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@vendure/dashboard';
import { FIELD_TYPE } from '../../../constants/UiTypes';

export interface OperatorSchemaField {
    key: string;
    label?: string;
    type: string;
    required?: boolean;
    description?: string;
    defaultValue?: unknown;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
}

interface OperatorFieldInputProps {
    field: OperatorSchemaField;
    value: unknown;
    onChange: (key: string, value: unknown) => void;
}

/**
 * Renders a schema-based field input based on field type.
 * Handles: select, boolean, number, text, json/object/array field types.
 */
export function OperatorFieldInput({ field, value, onChange }: OperatorFieldInputProps) {
    const isObject = field.type === FIELD_TYPE.JSON || field.type === FIELD_TYPE.OBJECT || field.type === FIELD_TYPE.ARRAY;

    const handleChange = (newValue: unknown) => {
        onChange(field.key, newValue);
    };

    // Select field type
    if (field.type === FIELD_TYPE.SELECT && field.options) {
        return (
            <div className="space-y-1">
                <div className="flex items-center gap-1">
                    <Label className="text-[11px] text-muted-foreground">
                        {field.label || field.key}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                </div>
                <Select
                    value={String(value ?? '')}
                    onValueChange={(v) => handleChange(v)}
                >
                    <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder={field.placeholder || `Select ${field.label || field.key}`} />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {field.description && (
                    <p className="text-[10px] text-muted-foreground">{field.description}</p>
                )}
            </div>
        );
    }

    // JSON/Object/Array field type
    if (isObject) {
        return (
            <div className="space-y-1">
                <div className="flex items-center gap-1">
                    <Label className="text-[11px] text-muted-foreground">
                        {field.label || field.key}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                </div>
                <Textarea
                    className="font-mono text-xs"
                    rows={3}
                    placeholder={field.placeholder || '{}'}
                    value={typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '')}
                    onChange={(e) => {
                        try {
                            handleChange(JSON.parse(e.target.value));
                        } catch {
                            handleChange(e.target.value);
                        }
                    }}
                />
                {field.description && (
                    <p className="text-[10px] text-muted-foreground">{field.description}</p>
                )}
            </div>
        );
    }

    // Number field type
    if (field.type === FIELD_TYPE.NUMBER) {
        return (
            <div className="space-y-1">
                <div className="flex items-center gap-1">
                    <Label className="text-[11px] text-muted-foreground">
                        {field.label || field.key}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                </div>
                <Input
                    type="number"
                    className="h-8 text-sm"
                    placeholder={field.placeholder}
                    value={value !== undefined ? String(value) : ''}
                    onChange={(e) => {
                        const val = e.target.value;
                        handleChange(val === '' ? undefined : Number(val));
                    }}
                />
                {field.description && (
                    <p className="text-[10px] text-muted-foreground">{field.description}</p>
                )}
            </div>
        );
    }

    // Boolean field type
    if (field.type === FIELD_TYPE.BOOLEAN) {
        return (
            <div className="space-y-1">
                <div className="flex items-center gap-1">
                    <Label className="text-[11px] text-muted-foreground">
                        {field.label || field.key}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                </div>
                <Select
                    value={value === true ? 'true' : value === false ? 'false' : ''}
                    onValueChange={(v) => handleChange(v === 'true')}
                >
                    <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                </Select>
                {field.description && (
                    <p className="text-[10px] text-muted-foreground">{field.description}</p>
                )}
            </div>
        );
    }

    // Default: text field type
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1">
                <Label className="text-[11px] text-muted-foreground">
                    {field.label || field.key}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
            </div>
            <Input
                className="h-8 text-sm"
                placeholder={field.placeholder}
                value={String(value ?? '')}
                onChange={(e) => handleChange(e.target.value)}
            />
            {field.description && (
                <p className="text-[10px] text-muted-foreground">{field.description}</p>
            )}
        </div>
    );
}

interface GenericArgInputProps {
    argKey: string;
    value: unknown;
    onChange: (key: string, value: unknown) => void;
    onRemove: (key: string) => void;
}

/**
 * Renders an input for a generic argument (no schema definition).
 * Automatically handles object vs string values.
 */
export function GenericArgInput({ argKey, value, onChange, onRemove }: GenericArgInputProps) {
    return (
        <div className="flex items-start gap-2">
            <div className="flex-1">
                <Label className="text-[11px] text-muted-foreground">{argKey}</Label>
                {typeof value === 'object' ? (
                    <Textarea
                        className="font-mono text-xs mt-0.5"
                        rows={3}
                        value={JSON.stringify(value, null, 2)}
                        onChange={(e) => {
                            try {
                                onChange(argKey, JSON.parse(e.target.value));
                            } catch {
                                onChange(argKey, e.target.value);
                            }
                        }}
                    />
                ) : (
                    <Input
                        className="mt-0.5 text-sm"
                        value={String(value ?? '')}
                        onChange={(e) => onChange(argKey, e.target.value)}
                    />
                )}
            </div>
            <button
                type="button"
                className="h-6 w-6 p-0 mt-5 text-destructive hover:bg-destructive/10 rounded inline-flex items-center justify-center"
                onClick={() => onRemove(argKey)}
                aria-label={`Remove argument ${argKey}`}
            >
                {'\u00D7'}
            </button>
        </div>
    );
}
