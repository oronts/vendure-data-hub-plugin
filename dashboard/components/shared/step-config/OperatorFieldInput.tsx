import * as React from 'react';
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@vendure/dashboard';
import { FIELD_TYPE } from '../../../constants';

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

/** Renders the field label with an improved required indicator */
function FieldLabel({ field }: { field: OperatorSchemaField }) {
    return (
        <div className="flex items-center gap-1.5">
            <Label className="text-xs font-medium text-foreground/80">
                {field.label || field.key}
            </Label>
            {field.required && (
                <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-destructive/10 text-destructive leading-tight">
                    required
                </span>
            )}
        </div>
    );
}

/** Renders field description as help text below the input */
function FieldDescription({ text }: { text?: string }) {
    if (!text) return null;
    return (
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{text}</p>
    );
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
            <div className="space-y-1.5">
                <FieldLabel field={field} />
                <Select
                    value={String(value ?? '')}
                    onValueChange={(v) => handleChange(v)}
                >
                    <SelectTrigger className="h-9 text-sm">
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
                <FieldDescription text={field.description} />
            </div>
        );
    }

    // JSON/Object/Array field type
    if (isObject) {
        return (
            <div className="space-y-1.5">
                <FieldLabel field={field} />
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
                <FieldDescription text={field.description} />
            </div>
        );
    }

    // Number field type
    if (field.type === FIELD_TYPE.NUMBER) {
        return (
            <div className="space-y-1.5">
                <FieldLabel field={field} />
                <Input
                    type="number"
                    className="h-9 text-sm"
                    placeholder={field.placeholder}
                    value={value !== undefined ? String(value) : ''}
                    onChange={(e) => {
                        const val = e.target.value;
                        handleChange(val === '' ? undefined : Number(val));
                    }}
                />
                <FieldDescription text={field.description} />
            </div>
        );
    }

    // Boolean field type
    if (field.type === FIELD_TYPE.BOOLEAN) {
        return (
            <div className="space-y-1.5">
                <FieldLabel field={field} />
                <Select
                    value={value === true ? 'true' : value === false ? 'false' : ''}
                    onValueChange={(v) => handleChange(v === 'true')}
                >
                    <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                </Select>
                <FieldDescription text={field.description} />
            </div>
        );
    }

    // Default: text field type
    return (
        <div className="space-y-1.5">
            <FieldLabel field={field} />
            <Input
                className="h-9 text-sm"
                placeholder={field.placeholder}
                value={String(value ?? '')}
                onChange={(e) => handleChange(e.target.value)}
            />
            <FieldDescription text={field.description} />
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
        <div className="flex items-start gap-2 p-2 rounded-md bg-muted/30 border border-border/50">
            <div className="flex-1">
                <Label className="text-xs font-medium text-foreground/80">{argKey}</Label>
                {typeof value === 'object' ? (
                    <Textarea
                        className="font-mono text-xs mt-1"
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
                        className="mt-1 h-9 text-sm"
                        value={String(value ?? '')}
                        onChange={(e) => onChange(argKey, e.target.value)}
                    />
                )}
            </div>
            <button
                type="button"
                className="h-6 w-6 p-0 mt-5 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-md inline-flex items-center justify-center transition-colors"
                onClick={() => onRemove(argKey)}
                aria-label={`Remove argument ${argKey}`}
            >
                {'\u00D7'}
            </button>
        </div>
    );
}
