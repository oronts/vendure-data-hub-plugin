import * as React from 'react';
import { useCallback } from 'react';
import { Input } from '@vendure/dashboard';
import type { AdapterSchemaField } from '../../../../types';

export interface NumberFieldProps {
    field: AdapterSchemaField;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    compact?: boolean;
    disabled?: boolean;
}

export function NumberField({ field, value, onChange, compact, disabled }: NumberFieldProps) {
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        onChange(val === '' ? undefined : Number(val));
    }, [onChange]);

    return (
        <Input
            id={field.key}
            type="number"
            value={value ?? field.default ?? ''}
            onChange={handleChange}
            placeholder={field.placeholder}
            disabled={disabled}
            min={field.validation?.min}
            max={field.validation?.max}
            className={compact ? 'h-8 text-sm' : ''}
        />
    );
}
