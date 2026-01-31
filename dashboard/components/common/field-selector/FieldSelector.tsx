import * as React from 'react';
import { memo, useCallback } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import type { FieldSelectorProps } from '../../../types';
import { SENTINEL_VALUES } from '../../../constants';

function FieldSelectorComponent({
    value,
    onChange,
    fields,
    placeholder = 'Select field',
    className = '',
    disabled = false,
    allowEmpty = true,
    emptyLabel = 'Select field...',
}: FieldSelectorProps) {
    const handleChange = useCallback((newValue: string) => {
        onChange(newValue === SENTINEL_VALUES.NONE ? '' : newValue);
    }, [onChange]);

    return (
        <Select
            value={value || SENTINEL_VALUES.NONE}
            onValueChange={handleChange}
            disabled={disabled}
        >
            <SelectTrigger className={className}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {allowEmpty && (
                    <SelectItem value={SENTINEL_VALUES.NONE}>{emptyLabel}</SelectItem>
                )}
                {fields.map(field => (
                    <SelectItem key={field} value={field}>
                        {field}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export const FieldSelector = memo(FieldSelectorComponent);
