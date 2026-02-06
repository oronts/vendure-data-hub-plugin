import * as React from 'react';
import { Switch } from '@vendure/dashboard';
import type { AdapterSchemaField } from '../../../../types';

export interface BooleanFieldProps {
    field: AdapterSchemaField;
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}

export function BooleanField({ field, value, onChange, disabled }: BooleanFieldProps) {
    return (
        <div className="flex items-center gap-2">
            <Switch
                id={field.key}
                checked={value ?? (field.default as boolean) ?? false}
                onCheckedChange={onChange}
                disabled={disabled}
            />
            {field.description && (
                <span className="text-xs text-muted-foreground">{field.description}</span>
            )}
        </div>
    );
}
