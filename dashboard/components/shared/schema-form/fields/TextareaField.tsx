import * as React from 'react';
import { useCallback } from 'react';
import { Textarea } from '@vendure/dashboard';
import type { AdapterSchemaField } from '../../../../types';
import { CodeEditorWithExpand } from '../../CodeEditor';

export interface TextareaFieldProps {
    field: AdapterSchemaField;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
    disabled?: boolean;
    isCode?: boolean;
}

export function TextareaField({ field, value, onChange, compact, disabled, isCode = false }: TextareaFieldProps) {
    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
    }, [onChange]);

    if (!isCode) {
        return (
            <Textarea
                id={field.key}
                value={value ?? field.default ?? ''}
                onChange={handleChange}
                placeholder={field.placeholder}
                disabled={disabled}
                rows={compact ? 2 : 5}
                className={compact ? 'text-sm' : ''}
            />
        );
    }

    return (
        <CodeEditorWithExpand
            id={field.key}
            label={field.label || field.key}
            value={value ?? field.default ?? ''}
            onChange={onChange}
            placeholder={field.placeholder}
            disabled={disabled}
            rows={compact ? 6 : 12}
        />
    );
}
