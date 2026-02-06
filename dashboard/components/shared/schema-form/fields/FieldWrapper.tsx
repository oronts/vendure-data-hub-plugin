import * as React from 'react';
import { Label } from '@vendure/dashboard';
import type { AdapterSchemaField } from '../../../../types';

export interface FieldWrapperProps {
    field: AdapterSchemaField;
    compact?: boolean;
    error?: string;
    children: React.ReactNode;
}

export function FieldWrapper({ field, compact, error, children }: FieldWrapperProps) {
    return (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
            <div className="flex items-center gap-1">
                <Label htmlFor={field.key} className={compact ? 'text-xs font-medium' : 'text-sm font-medium'}>
                    {field.label || field.key}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
            </div>
            {children}
            {field.description && !compact && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
