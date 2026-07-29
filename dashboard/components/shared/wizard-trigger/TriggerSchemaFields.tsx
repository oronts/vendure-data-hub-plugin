import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
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
import {
    isTriggerSchemaFieldVisible,
    resolveTriggerFieldOptions,
    type TriggerOptionSources,
} from '../../../utils/trigger-schema';
import { getNestedValue } from '../../../../shared/utils/object-path';
import { ResourceReferenceSelector } from '../ResourceReferenceSelector';

export interface TriggerSchemaFieldsProps {
    /** Field definitions from the trigger type schema */
    fields: ConnectionSchemaField[];
    /** Current trigger config values */
    values: Record<string, unknown>;
    /** Called when a field value changes */
    onChange: (key: string, value: unknown) => void;
    optionSources?: TriggerOptionSources;
}

/**
 * Renders form fields dynamically from a trigger type schema.
 * Used by both import and export wizard TriggerStep components
 * for schema-driven trigger configuration.
 *
 * Supports field types: select (dropdown), boolean (switch), number, and string (text input).
 */
export function TriggerSchemaFields({ fields, values, onChange, optionSources }: TriggerSchemaFieldsProps) {
    const { t } = useLingui();

    return (
        <div className="space-y-4">
            {fields.map(field => {
                if (!isTriggerSchemaFieldVisible(field, values)) return null;
                const fieldType = field.type.toLowerCase();
                const currentValue = getNestedValue(values, field.key);
                const options = resolveTriggerFieldOptions(field, optionSources);
                const hasOptions = options.length > 0;
                const inputId = `trigger-${field.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

                if (fieldType === 'secret' || fieldType === 'connection') {
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label htmlFor={inputId} className="text-sm font-medium">
                                {field.label}{field.required ? ' *' : ''}
                            </Label>
                            <ResourceReferenceSelector
                                id={inputId}
                                resource={fieldType}
                                value={String(currentValue ?? '')}
                                onValueChange={value => onChange(field.key, value)}
                                placeholder={field.placeholder ?? (
                                    fieldType === 'secret'
                                        ? t`Select a secret`
                                        : t`Select a connection`
                                )}
                            />
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                    );
                }

                // Select field: has explicit options array or type is 'select'
                if (fieldType === 'select' || (hasOptions && fieldType !== 'boolean' && fieldType !== 'number')) {
                    const selectValue = String(currentValue ?? field.defaultValue ?? '');
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label htmlFor={inputId} className="text-sm font-medium">
                                {field.label}{field.required ? ' *' : ''}
                            </Label>
                            <Select
                                value={selectValue}
                                onValueChange={(v) => onChange(field.key, v)}
                            >
                                <SelectTrigger id={inputId}>
                                    <SelectValue
                                        placeholder={field.placeholder ?? t`Select ${field.label}`}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {options.map((opt) => (
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
                                id={inputId}
                                checked={boolValue}
                                onCheckedChange={(checked) => onChange(field.key, checked)}
                            />
                            <Label htmlFor={inputId} className="text-sm font-medium">{field.label}</Label>
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
                            <Label htmlFor={inputId} className="text-sm font-medium">
                                {field.label}{field.required ? ' *' : ''}
                            </Label>
                            <Input
                                id={inputId}
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
                        <Label htmlFor={inputId} className="text-sm font-medium">
                            {field.label}{field.required ? ' *' : ''}
                        </Label>
                        <Input
                            id={inputId}
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
