import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import type { AdapterSchemaField } from '../../../../types';
import { ResourceReferenceSelector } from '../../ResourceReferenceSelector';
import type { ReferenceResource } from '../../ResourceReferenceSelector';

export interface SelectFieldProps {
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
}

export function SelectField({ field, value, onChange, compact, disabled }: SelectFieldProps) {
    const { t } = useLingui();
    const validOptions = field.options?.filter(o => o.value !== '') ?? [];
    return (
        <Select value={value ?? (field.default as string) ?? ''} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={compact ? 'h-8 text-sm' : ''}>
                <SelectValue
                    placeholder={field.placeholder ?? t`Select ${field.label || field.key}`}
                />
            </SelectTrigger>
            <SelectContent>
                {validOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export interface ReferenceFieldProps {
    resource: ReferenceResource;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    compact?: boolean;
    disabled?: boolean;
}

export function ReferenceField({ resource, value, onChange, placeholder, compact, disabled }: ReferenceFieldProps) {
    const { t } = useLingui();
    const resolvedPlaceholder = placeholder ?? (resource === 'secret'
        ? t`Select secret...`
        : t`Select connection...`);

    return (
        <ResourceReferenceSelector
            resource={resource}
            value={value ?? ''}
            onValueChange={onChange}
            placeholder={resolvedPlaceholder}
            compact={compact}
            disabled={disabled}
        />
    );
}
