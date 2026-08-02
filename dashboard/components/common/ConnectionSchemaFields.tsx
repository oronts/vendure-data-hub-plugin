import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Textarea,
} from '@vendure/dashboard';
import { FieldError } from './ValidationFeedback';
import {
    getConfigFieldId,
    type ConfigFieldDef,
} from './connection-config';
import { SecretReferenceInput } from './SecretReferenceInput';

interface ConnectionSchemaFieldsProps {
    schema: ConfigFieldDef[];
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
    disabled?: boolean;
}

export function ConnectionSchemaFields({
    schema,
    config,
    onChange,
    disabled,
}: ConnectionSchemaFieldsProps) {
    const updateField = (key: string, value: unknown) => {
        const next = { ...config };
        if (value === undefined || value === '' || value === null) {
            delete next[key];
        } else {
            next[key] = value;
        }
        onChange(next);
    };

    return (
        <div className="space-y-4">
            {schema.map(field => {
                const inputId = getConfigFieldId(field.key);
                return (
                    <div
                        key={field.key}
                        className="space-y-1"
                    >
                        <Label htmlFor={inputId} className="text-sm font-medium">
                            {field.label}
                            {field.required && (
                                <>
                                    <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
                                    <span className="sr-only">
                                        <Trans>Required</Trans>
                                    </span>
                                </>
                            )}
                        </Label>
                        <ConfigField
                            field={field}
                            inputId={inputId}
                            value={config[field.key]}
                            onChange={value => updateField(field.key, value)}
                            disabled={disabled}
                        />
                        {field.description && (
                            <p className="text-xs text-muted-foreground">
                                {field.description}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

interface ConfigFieldProps {
    field: ConfigFieldDef;
    inputId: string;
    value: unknown;
    onChange: (value: unknown) => void;
    disabled?: boolean;
}

function ConfigField({
    field,
    inputId,
    value,
    onChange,
    disabled,
}: ConfigFieldProps) {
    const { t } = useLingui();
    const [touched, setTouched] = React.useState(false);
    const requiredError = field.required && isEmpty(value)
        ? t`${field.label} is required.`
        : null;
    const valueError = getValueError(field, value, {
        invalidPort: t`Enter a whole-number port between 1 and 65535`,
        invalidNumber: t`Enter a valid whole number for ${field.label}.`,
        invalidJson: t`Enter a valid JSON object.`,
    });
    const error = requiredError ?? valueError;

    switch (field.type) {
        case 'secret':
            return (
                <SecretReferenceInput
                    id={inputId}
                    value={value != null ? String(value) : ''}
                    onChange={onChange}
                    placeholder={field.placeholder}
                    disabled={disabled}
                    aria-required={field.required}
                />
            );
        case 'boolean':
            return (
                <div className="flex items-center gap-2">
                    <Switch
                        id={inputId}
                        checked={Boolean(value)}
                        onCheckedChange={onChange}
                        disabled={disabled}
                        aria-required={field.required}
                    />
                    <span className="text-sm text-muted-foreground">
                        {value ? t`Enabled` : t`Disabled`}
                    </span>
                </div>
            );
        case 'number':
            return (
                <div>
                    <Input
                        type="number"
                        id={inputId}
                        value={value != null ? String(value) : ''}
                        onChange={event => onChange(
                            event.target.value
                                ? Number(event.target.value)
                                : undefined,
                        )}
                        onBlur={() => setTouched(true)}
                        placeholder={field.placeholder}
                        min={field.min}
                        max={field.max}
                        step={1}
                        disabled={disabled}
                        className={error && touched
                            ? 'border-destructive focus-visible:ring-destructive'
                            : ''}
                        aria-required={field.required}
                        aria-invalid={Boolean(error && touched)}
                        aria-describedby={`${inputId}-feedback`}
                    />
                    <div id={`${inputId}-feedback`}>
                        <FieldError error={error} touched={touched} />
                    </div>
                </div>
            );
        case 'select':
            return (
                <Select
                    value={typeof value === 'string' ? value : ''}
                    onValueChange={onChange}
                    disabled={disabled}
                >
                    <SelectTrigger
                        id={inputId}
                        aria-required={field.required}
                    >
                        <SelectValue placeholder={field.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options?.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        case 'json': {
            const text = typeof value === 'string'
                ? value
                : value === undefined
                    ? ''
                    : JSON.stringify(value, null, 2);
            return (
                <div>
                    <Textarea
                        id={inputId}
                        value={text}
                        onChange={event => onChange(event.target.value || undefined)}
                        onBlur={() => setTouched(true)}
                        placeholder={field.placeholder ?? '{}'}
                        disabled={disabled}
                        rows={8}
                        className={`font-mono text-xs ${error && touched
                            ? 'border-destructive focus-visible:ring-destructive'
                            : ''}`}
                        aria-required={field.required}
                        aria-invalid={Boolean(error && touched)}
                        aria-describedby={`${inputId}-feedback`}
                    />
                    <div id={`${inputId}-feedback`}>
                        <FieldError error={error} touched={touched} />
                    </div>
                </div>
            );
        }
        case 'password':
            return (
                <TextInput
                    type="password"
                    field={field}
                    inputId={inputId}
                    value={value}
                    onChange={onChange}
                    onBlur={() => setTouched(true)}
                    error={error}
                    touched={touched}
                    disabled={disabled}
                />
            );
        default:
            return (
                <TextInput
                    type="text"
                    field={field}
                    inputId={inputId}
                    value={value}
                    onChange={onChange}
                    onBlur={() => setTouched(true)}
                    error={error}
                    touched={touched}
                    disabled={disabled}
                />
            );
    }
}

interface TextInputProps extends ConfigFieldProps {
    type: 'text' | 'password';
    onBlur: () => void;
    error: string | null;
    touched: boolean;
}

function TextInput({
    type,
    field,
    inputId,
    value,
    onChange,
    onBlur,
    error,
    touched,
    disabled,
}: TextInputProps) {
    return (
        <div>
            <Input
                type={type}
                id={inputId}
                value={String(value ?? '')}
                onChange={event => onChange(event.target.value || undefined)}
                onBlur={onBlur}
                placeholder={field.placeholder}
                disabled={disabled}
                className={error && touched
                    ? 'border-destructive focus-visible:ring-destructive'
                    : ''}
                aria-required={field.required}
                aria-invalid={Boolean(error && touched)}
                aria-describedby={`${inputId}-feedback`}
            />
            <div id={`${inputId}-feedback`}>
                <FieldError error={error} touched={touched} />
            </div>
        </div>
    );
}

interface ConfigValidationMessages {
    invalidPort: string;
    invalidNumber: string;
    invalidJson: string;
}

function getValueError(
    field: ConfigFieldDef,
    value: unknown,
    messages: ConfigValidationMessages,
): string | null {
    if (isEmpty(value)) return null;
    if (
        field.type === 'number'
        && (
            typeof value !== 'number'
            || !Number.isInteger(value)
            || (field.min !== undefined && value < field.min)
            || (field.max !== undefined && value > field.max)
        )
    ) {
        return field.key === 'port'
            ? messages.invalidPort
            : messages.invalidNumber;
    }
    if (field.type === 'json' && !isJsonObject(value)) {
        return messages.invalidJson;
    }
    return null;
}

function isJsonObject(value: unknown): boolean {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value) as unknown;
        } catch {
            return false;
        }
    }
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
}

function isEmpty(value: unknown): boolean {
    return value === undefined
        || value === null
        || (typeof value === 'string' && value.trim() === '');
}
