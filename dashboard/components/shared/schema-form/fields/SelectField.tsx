import * as React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import type { AdapterSchemaField } from '../../../../types';

export interface SelectFieldProps {
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
}

export function SelectField({ field, value, onChange, compact, disabled }: SelectFieldProps) {
    return (
        <Select value={value ?? (field.default as string) ?? ''} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={compact ? 'h-8 text-sm' : ''}>
                <SelectValue placeholder={field.placeholder ?? `Select ${field.label || field.key}`} />
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
    return (
        <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={compact ? 'h-8 text-sm' : ''}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.length === 0 ? (
                    <SelectItem value="" disabled>
                        No options available
                    </SelectItem>
                ) : (
                    options.map((code) => (
                        <SelectItem key={code} value={code}>
                            {code}
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
    );
}
