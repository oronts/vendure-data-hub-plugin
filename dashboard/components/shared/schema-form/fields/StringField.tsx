import * as React from 'react';
import { useCallback } from 'react';
import { Input } from '@vendure/dashboard';
import type { AdapterSchemaField } from '../../../../types';

function normalizeFieldType(type: string): string {
    return type.toLowerCase();
}

export interface StringFieldProps {
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
}

export function StringField({ field, value, onChange, compact, disabled }: StringFieldProps) {
    const fieldType = normalizeFieldType(field.type);
    const inputType = fieldType === 'password' ? 'password' :
                      fieldType === 'email' ? 'email' :
                      fieldType === 'url' ? 'url' : 'text';

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
    }, [onChange]);

    return (
        <Input
            id={field.key}
            type={inputType}
            value={value ?? field.default ?? ''}
            onChange={handleChange}
            placeholder={field.placeholder}
            disabled={disabled}
            className={compact ? 'h-8 text-sm' : ''}
        />
    );
}
