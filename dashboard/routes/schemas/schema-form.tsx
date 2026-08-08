import * as React from 'react';
import {
    DetailFormGrid,
    FormFieldWrapper,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
} from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';
import type { UseFormReturn } from 'react-hook-form';
import { DataHubSchemaCompatibility } from '../../gql/graphql';
import type { JsonObject } from '../../../shared';

const COMPATIBILITY_OPTIONS = ['STRICT', 'BACKWARD', 'PERMISSIVE'] as const;

export const DEFAULT_SCHEMA_DEFINITION = JSON.stringify({
    fields: {
        sku: {
            type: 'string',
            required: true,
        },
    },
}, null, 2);

export interface CreateSchemaFormValues {
    schemaId: string;
    version: string;
    compatibility: DataHubSchemaCompatibility;
}

export function SchemaIdentityFields({
    form,
}: Readonly<{ form: UseFormReturn<CreateSchemaFormValues> }>) {
    const { t } = useLingui();
    return (
        <DetailFormGrid>
            <FormFieldWrapper
                name="schemaId"
                label={<Trans>Schema ID</Trans>}
                control={form.control}
                rules={{ required: t`Schema ID is required` }}
                render={({ field }) => (
                    <Input
                        {...field}
                        aria-label={t`Schema ID`}
                        placeholder="catalog.product"
                        autoComplete="off"
                    />
                )}
            />
            <FormFieldWrapper
                name="version"
                label={<Trans>Version</Trans>}
                control={form.control}
                rules={{ required: t`Version is required` }}
                render={({ field }) => (
                    <Input
                        {...field}
                        aria-label={t`Version`}
                        placeholder="1.0.0"
                        autoComplete="off"
                    />
                )}
            />
            <FormFieldWrapper
                name="compatibility"
                label={<Trans>Compatibility</Trans>}
                control={form.control}
                render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-label={t`Compatibility`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {COMPATIBILITY_OPTIONS.map(option => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            />
        </DetailFormGrid>
    );
}

export function ReadOnlyField({
    label,
    value,
}: Readonly<{ label: string; value?: string }>) {
    return (
        <div className="space-y-2">
            <span className="text-sm font-medium">{label}</span>
            <Input value={value ?? ''} aria-label={label} disabled />
        </div>
    );
}

export function JsonTextField({
    label,
    value,
    onChange,
    disabled,
    required,
}: Readonly<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    required?: boolean;
}>) {
    const id = React.useId();
    return (
        <div className="mt-6 space-y-2">
            <label htmlFor={id} className="text-sm font-medium">
                {label}{required ? ' *' : ''}
            </label>
            <Textarea
                id={id}
                value={value}
                onChange={event => onChange(event.target.value)}
                disabled={disabled}
                rows={12}
                spellCheck={false}
                className="font-mono text-xs"
            />
        </div>
    );
}

interface JsonObjectMessages {
    readonly invalidJson: string;
    readonly notObject: string;
}

export function parseJsonObject(value: string, messages: JsonObjectMessages): JsonObject {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error(messages.invalidJson);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(messages.notObject);
    }
    return parsed as JsonObject;
}

export function parseOptionalJsonObject(
    value: string,
    messages: JsonObjectMessages,
): JsonObject | null {
    return value.trim() === '' ? null : parseJsonObject(value, messages);
}

export function formatJson(value: unknown): string {
    return value == null ? '' : JSON.stringify(value, null, 2);
}
