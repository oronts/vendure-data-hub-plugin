import * as React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import type { AdapterSchemaField } from '../../../../types';
import { SENTINEL_VALUES } from '../../../../constants';

export interface SelectFieldProps {
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
}

export function SelectField({ field, value, onChange, compact, disabled }: SelectFieldProps) {
    const validOptions = field.options?.filter(o => o.value !== '') ?? [];
    return (
        <Select value={value ?? (field.default as string) ?? ''} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={compact ? 'h-8 text-sm' : ''}>
                <SelectValue placeholder={field.placeholder ?? `Select ${field.label || field.key}`} />
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
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder: string;
    compact?: boolean;
    disabled?: boolean;
}

export function ReferenceField({ field, value, onChange, options, placeholder, compact, disabled }: ReferenceFieldProps) {
    const validOptions = options.filter(o => o !== '');
    return (
        <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={compact ? 'h-8 text-sm' : ''}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {validOptions.length === 0 ? (
                    <SelectItem value={SENTINEL_VALUES.NONE} disabled>
                        No options available
                    </SelectItem>
                ) : (
                    validOptions.map((code) => (
                        <SelectItem key={code} value={code}>
                            {code}
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
    );
}
