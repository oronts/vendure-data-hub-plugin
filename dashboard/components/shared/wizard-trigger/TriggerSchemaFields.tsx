import * as React from 'react';
import {
    Input,
    Label,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import type { ConnectionSchemaField } from '../../../hooks/api/use-config-options';

export interface TriggerSchemaFieldsProps {
    /** Field definitions from the trigger type schema */
    fields: ConnectionSchemaField[];
    /** Current trigger config values */
    values: Record<string, unknown>;
    /** Called when a field value changes */
    onChange: (key: string, value: unknown) => void;
}

/**
 * Renders form fields dynamically from a trigger type schema.
 * Used by both import and export wizard TriggerStep components
 * for schema-driven trigger configuration.
 *
 * Supports field types: select (dropdown), boolean (switch), number, and string (text input).
 */
export function TriggerSchemaFields({ fields, values, onChange }: TriggerSchemaFieldsProps) {
    return (
        <div className="space-y-4">
            {fields.map(field => {
                const fieldType = field.type.toLowerCase();
                const currentValue = values[field.key];
                const hasOptions = field.options && field.options.length > 0;

                // Select field: has explicit options array or type is 'select'
                if (fieldType === 'select' || (hasOptions && fieldType !== 'boolean' && fieldType !== 'number')) {
                    const selectValue = String(currentValue ?? field.defaultValue ?? '');
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label className="text-sm font-medium">
                                {field.label}{field.required ? ' *' : ''}
                            </Label>
                            <Select
                                value={selectValue}
                                onValueChange={(v) => onChange(field.key, v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={field.placeholder ?? `Select ${field.label}`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(field.options ?? []).map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                    );
                }

                // Boolean field: rendered as a switch toggle
                if (fieldType === 'boolean') {
                    const boolValue = currentValue != null ? Boolean(currentValue) : (field.defaultValue as boolean ?? false);
                    return (
                        <div key={field.key} className="flex items-center gap-2">
                            <Switch
                                checked={boolValue}
                                onCheckedChange={(checked) => onChange(field.key, checked)}
                            />
                            <Label className="text-sm font-medium">{field.label}</Label>
                            {field.description && (
                                <p className="text-xs text-muted-foreground ml-2">{field.description}</p>
                            )}
                        </div>
                    );
                }

                // Number field: rendered as a number input
                if (fieldType === 'number') {
                    const numValue = currentValue != null ? Number(currentValue) : (field.defaultValue as number ?? 0);
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label className="text-sm font-medium">
                                {field.label}{field.required ? ' *' : ''}
                            </Label>
                            <Input
                                type="number"
                                value={numValue}
                                onChange={(e) => {
                                    const parsed = Number(e.target.value);
                                    onChange(field.key, Number.isFinite(parsed) ? parsed : field.defaultValue ?? 0);
                                }}
                                placeholder={field.placeholder ?? undefined}
                            />
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                    );
                }

                // Default: string/text input
                return (
                    <div key={field.key} className="space-y-2">
                        <Label className="text-sm font-medium">
                            {field.label}{field.required ? ' *' : ''}
                        </Label>
                        <Input
                            value={String(currentValue ?? '')}
                            onChange={(e) => onChange(field.key, e.target.value)}
                            placeholder={field.placeholder ?? undefined}
                        />
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
