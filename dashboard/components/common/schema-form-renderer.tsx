/**
 * Schema Form Renderer
 *
 * Renders dynamic forms based on a schema definition.
 * Used for adapter configuration, step configuration, etc.
 */
import * as React from 'react';
import {
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Textarea,
    Label,
} from '@vendure/dashboard';

// TYPES

export interface SchemaFieldOption {
    value: string;
    label: string;
}

export interface SchemaFieldDependency {
    field: string;
    value: unknown;
    operator?: 'eq' | 'neq' | 'in' | 'nin';
}

export interface SchemaField {
    key: string;
    label: string;
    description?: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'textarea' | 'json' | 'password' | 'array';
    required?: boolean;
    defaultValue?: unknown;
    placeholder?: string;
    options?: SchemaFieldOption[];
    group?: string;
    dependsOn?: SchemaFieldDependency;
    validation?: {
        min?: number;
        max?: number;
        minLength?: number;
        maxLength?: number;
        pattern?: string;
    };
}

export interface SchemaFormRendererProps {
    fields: SchemaField[];
    values: Record<string, unknown>;
    onChange: (values: Record<string, unknown>) => void;
    compact?: boolean;
    disabled?: boolean;
    errors?: Record<string, string>;
}

// HELPER FUNCTIONS

function evaluateDependency(
    dependency: SchemaFieldDependency | undefined,
    values: Record<string, unknown>
): boolean {
    if (!dependency) return true;

    const fieldValue = values[dependency.field];
    const targetValue = dependency.value;
    const operator = dependency.operator ?? 'eq';

    switch (operator) {
        case 'eq':
            return fieldValue === targetValue;
        case 'neq':
            return fieldValue !== targetValue;
        case 'in':
            return Array.isArray(targetValue) && targetValue.includes(fieldValue);
        case 'nin':
            return Array.isArray(targetValue) && !targetValue.includes(fieldValue);
        default:
            return true;
    }
}

// FIELD COMPONENTS

interface FieldWrapperProps {
    field: SchemaField;
    compact?: boolean;
    error?: string;
    children: React.ReactNode;
}

function FieldWrapper({ field, compact, error, children }: FieldWrapperProps) {
    return (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
            <div className="flex items-center gap-1">
                <Label htmlFor={field.key} className={compact ? 'text-xs' : 'text-sm'}>
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
            </div>
            {children}
            {field.description && !compact && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    );
}

interface StringFieldProps {
    field: SchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
}

function StringField({ field, value, onChange, compact, disabled }: StringFieldProps) {
    return (
        <Input
            id={field.key}
            type={field.type === 'password' ? 'password' : 'text'}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className={compact ? 'h-8 text-sm' : ''}
        />
    );
}

interface NumberFieldProps {
    field: SchemaField;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    compact?: boolean;
    disabled?: boolean;
}

function NumberField({ field, value, onChange, compact, disabled }: NumberFieldProps) {
    return (
        <Input
            id={field.key}
            type="number"
            value={value ?? ''}
            onChange={(e) => {
                const val = e.target.value;
                onChange(val === '' ? undefined : Number(val));
            }}
            placeholder={field.placeholder}
            disabled={disabled}
            min={field.validation?.min}
            max={field.validation?.max}
            className={compact ? 'h-8 text-sm' : ''}
        />
    );
}

interface BooleanFieldProps {
    field: SchemaField;
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}

function BooleanField({ field, value, onChange, disabled }: BooleanFieldProps) {
    return (
        <div className="flex items-center gap-2">
            <Switch
                id={field.key}
                checked={value ?? false}
                onCheckedChange={onChange}
                disabled={disabled}
            />
            {field.description && (
                <span className="text-xs text-muted-foreground">{field.description}</span>
            )}
        </div>
    );
}

interface SelectFieldProps {
    field: SchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
}

function SelectField({ field, value, onChange, compact, disabled }: SelectFieldProps) {
    return (
        <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={compact ? 'h-8 text-sm' : ''}>
                <SelectValue placeholder={field.placeholder ?? `Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
                {field.options?.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

interface TextareaFieldProps {
    field: SchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
}

function TextareaField({ field, value, onChange, compact, disabled }: TextareaFieldProps) {
    return (
        <Textarea
            id={field.key}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            rows={compact ? 2 : 4}
            className={compact ? 'text-sm' : ''}
        />
    );
}

interface JsonFieldProps {
    field: SchemaField;
    value: unknown;
    onChange: (value: unknown) => void;
    compact?: boolean;
    disabled?: boolean;
}

function JsonField({ field, value, onChange, compact, disabled }: JsonFieldProps) {
    const [text, setText] = React.useState(() => {
        try {
            return value ? JSON.stringify(value, null, 2) : '';
        } catch {
            return '';
        }
    });
    const [error, setError] = React.useState<string | null>(null);
    const [isPending, setIsPending] = React.useState(false);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = React.useRef(true);

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // Sync with external value changes
    React.useEffect(() => {
        try {
            const newText = value ? JSON.stringify(value, null, 2) : '';
            // Only update if the parsed values differ (avoid cursor jumps)
            const currentParsed = text.trim() ? JSON.parse(text) : undefined;
            if (JSON.stringify(currentParsed) !== JSON.stringify(value)) {
                setText(newText);
                setError(null);
            }
        } catch {
            // Keep current text if comparison fails
        }
    }, [value]);

    const validateJson = React.useCallback((jsonText: string): string | null => {
        if (!jsonText.trim()) {
            return null;
        }
        try {
            JSON.parse(jsonText);
            return null;
        } catch (e) {
            const error = e as SyntaxError;
            let message = error.message
                .replace(/^JSON\.parse: /, '')
                .replace(/^SyntaxError: /, '');

            // Extract position info
            const posMatch = message.match(/at position (\d+)/i);
            if (posMatch) {
                const pos = parseInt(posMatch[1], 10);
                const lines = jsonText.substring(0, pos).split('\n');
                const line = lines.length;
                const col = lines[lines.length - 1].length + 1;
                message = message.replace(/ at position \d+/, '').replace(/ in JSON at position \d+/, '');
                return `Invalid JSON: ${message} (line ${line}, col ${col})`;
            }
            return `Invalid JSON: ${message}`;
        }
    }, []);

    const handleChange = (newText: string) => {
        setText(newText);
        setIsPending(true);

        // Clear existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Debounced validation (300ms)
        timeoutRef.current = setTimeout(() => {
            if (!mountedRef.current) return;

            setIsPending(false);
            const validationError = validateJson(newText);

            if (validationError) {
                setError(validationError);
            } else {
                setError(null);
                if (!newText.trim()) {
                    onChange(undefined);
                } else {
                    try {
                        onChange(JSON.parse(newText));
                    } catch {
                        // Should not happen since we validated
                    }
                }
            }
        }, 300);
    };

    // Determine border styling
    const getBorderClass = () => {
        if (disabled) return '';
        if (error) return 'border-red-500 focus:border-red-500 focus:ring-red-500/20';
        if (isPending) return 'border-amber-400';
        return '';
    };

    return (
        <div className="space-y-1">
            <Textarea
                id={field.key}
                value={text}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={field.placeholder ?? '{}'}
                disabled={disabled}
                rows={compact ? 3 : 6}
                className={`font-mono text-xs ${getBorderClass()}`}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    );
}

// MAIN COMPONENT

export function SchemaFormRenderer({
    fields,
    values,
    onChange,
    compact = false,
    disabled = false,
    errors = {},
}: SchemaFormRendererProps) {
    const handleFieldChange = (key: string, value: unknown) => {
        onChange({ ...values, [key]: value });
    };

    const visibleFields = fields.filter((field) =>
        evaluateDependency(field.dependsOn, values)
    );

    // Group fields if needed
    const groupedFields = new Map<string, SchemaField[]>();
    const ungroupedFields: SchemaField[] = [];

    for (const field of visibleFields) {
        if (field.group) {
            const group = groupedFields.get(field.group) ?? [];
            group.push(field);
            groupedFields.set(field.group, group);
        } else {
            ungroupedFields.push(field);
        }
    }

    const renderField = (field: SchemaField) => {
        const value = values[field.key] ?? field.defaultValue;
        const error = errors[field.key];

        switch (field.type) {
            case 'string':
            case 'password':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <StringField
                            field={field}
                            value={value as string}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={disabled}
                        />
                    </FieldWrapper>
                );

            case 'number':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <NumberField
                            field={field}
                            value={value as number | undefined}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={disabled}
                        />
                    </FieldWrapper>
                );

            case 'boolean':
                return (
                    <div key={field.key} className={compact ? 'py-1' : 'py-2'}>
                        <div className="flex items-center justify-between">
                            <Label htmlFor={field.key} className={compact ? 'text-xs' : 'text-sm'}>
                                {field.label}
                            </Label>
                            <BooleanField
                                field={field}
                                value={value as boolean}
                                onChange={(v) => handleFieldChange(field.key, v)}
                                disabled={disabled}
                            />
                        </div>
                        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                    </div>
                );

            case 'select':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <SelectField
                            field={field}
                            value={value as string}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={disabled}
                        />
                    </FieldWrapper>
                );

            case 'textarea':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <TextareaField
                            field={field}
                            value={value as string}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={disabled}
                        />
                    </FieldWrapper>
                );

            case 'json':
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <JsonField
                            field={field}
                            value={value}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={disabled}
                        />
                    </FieldWrapper>
                );

            default:
                return (
                    <FieldWrapper key={field.key} field={field} compact={compact} error={error}>
                        <StringField
                            field={field}
                            value={String(value ?? '')}
                            onChange={(v) => handleFieldChange(field.key, v)}
                            compact={compact}
                            disabled={disabled}
                        />
                    </FieldWrapper>
                );
        }
    };

    return (
        <div className={`space-y-${compact ? '2' : '4'}`}>
            {/* Ungrouped fields */}
            {ungroupedFields.map(renderField)}

            {/* Grouped fields */}
            {Array.from(groupedFields.entries()).map(([groupName, groupFields]) => (
                <div key={groupName} className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground capitalize">
                        {groupName.replace(/-/g, ' ')}
                    </h4>
                    <div className={`space-y-${compact ? '2' : '3'} pl-2 border-l-2`}>
                        {groupFields.map(renderField)}
                    </div>
                </div>
            ))}
        </div>
    );
}
