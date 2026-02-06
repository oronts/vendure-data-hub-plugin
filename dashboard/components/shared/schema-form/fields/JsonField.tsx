import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea } from '@vendure/dashboard';
import type { AdapterSchemaField } from '../../../../types';
import { DEBOUNCE_DELAYS } from '../../../../constants';

export interface JsonFieldProps {
    field: AdapterSchemaField;
    value: unknown;
    onChange: (value: unknown) => void;
    compact?: boolean;
    disabled?: boolean;
}

export function JsonField({ field, value, onChange, compact, disabled }: JsonFieldProps) {
    const [text, setText] = useState(() => {
        try {
            return value ? JSON.stringify(value, null, 2) : '';
        } catch {
            return '';
        }
    });
    const [error, setError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        try {
            const newText = value ? JSON.stringify(value, null, 2) : '';
            const currentParsed = text.trim() ? JSON.parse(text) : undefined;
            if (JSON.stringify(currentParsed) !== JSON.stringify(value)) {
                setText(newText);
                setError(null);
            }
        } catch {
            // JSON parse/stringify failed - keep existing text
        }
    }, [value, text]);

    const validateJson = useCallback((jsonText: string): string | null => {
        if (!jsonText.trim()) {
            return null;
        }
        try {
            JSON.parse(jsonText);
            return null;
        } catch (e) {
            const parseError = e as SyntaxError;
            let message = parseError.message
                .replace(/^JSON\.parse: /, '')
                .replace(/^SyntaxError: /, '');

            const posMatch = message.match(/at position (\d+)/i);
            if (posMatch) {
                const pos = parseInt(posMatch[1], 10);
                const lines = jsonText.substring(0, pos).split('\n');
                const line = lines.length;
                const col = lines[lines.length - 1].length + 1;
                message = message.replace(/ at position \d+/, '').replace(/ in JSON at position \d+/, '');
                return `Invalid JSON: ${message} (line ${line}, col ${col})`;
            }
            return `Invalid JSON: ${message}`;
        }
    }, []);

    const handleChange = useCallback((newText: string) => {
        setText(newText);
        setIsPending(true);

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            if (!mountedRef.current) return;

            setIsPending(false);
            const validationError = validateJson(newText);

            if (validationError) {
                setError(validationError);
            } else {
                setError(null);
                if (!newText.trim()) {
                    onChange(undefined);
                } else {
                    try {
                        onChange(JSON.parse(newText));
                    } catch {
                        // JSON parse failed - already handled by validation above
                    }
                }
            }
        }, DEBOUNCE_DELAYS.JSON_VALIDATION);
    }, [onChange, validateJson]);

    const getBorderClass = useCallback(() => {
        if (disabled) return '';
        if (error) return 'border-destructive focus:border-destructive focus:ring-destructive/20';
        if (isPending) return 'border-amber-400';
        return '';
    }, [disabled, error, isPending]);

    const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        handleChange(e.target.value);
    }, [handleChange]);

    return (
        <div className="space-y-1">
            <Textarea
                id={field.key}
                value={text}
                onChange={handleTextareaChange}
                placeholder={field.placeholder ?? '{}'}
                disabled={disabled}
                rows={compact ? 3 : 6}
                className={`font-mono text-xs ${getBorderClass()}`}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
