/**
 * JsonTextarea Component
 *
 * A reusable JSON input component with:
 * - Debounced validation (doesn't show errors while typing)
 * - Clear, user-friendly error messages with position info
 * - Error styling on the input field
 * - Support for both object and array values
 */

import * as React from 'react';
import { Textarea, Label } from '@vendure/dashboard';
import { AlertCircle } from 'lucide-react';
import { useJsonValidation, type UseJsonValidationOptions, type JsonValidationError } from '../../hooks/useJsonValidation';

export interface JsonTextareaProps {
    /** Current JSON value */
    value: unknown;
    /** Callback when value changes (only called with valid JSON) */
    onChange: (value: unknown) => void;
    /** Optional error callback for form-level validation */
    onError?: (error: JsonValidationError | null) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Number of rows */
    rows?: number;
    /** Label text */
    label?: string;
    /** Description/helper text */
    description?: string;
    /** Whether the field is disabled */
    disabled?: boolean;
    /** Additional class names */
    className?: string;
    /** Debounce delay in ms (default: 300) */
    debounceMs?: number;
    /** Whether empty values are allowed (default: true) */
    allowEmpty?: boolean;
    /** Expected type: 'object', 'array', or 'any' (default: 'any') */
    expectedType?: 'object' | 'array' | 'any';
    /** Whether to show the validation status indicator */
    showStatus?: boolean;
    /** Unique id for the textarea */
    id?: string;
}

export function JsonTextarea({
    value,
    onChange,
    onError,
    placeholder = '{}',
    rows = 4,
    label,
    description,
    disabled = false,
    className = '',
    debounceMs = 300,
    allowEmpty = true,
    expectedType = 'any',
    showStatus = true,
    id,
}: JsonTextareaProps) {
    const fieldId = id ?? React.useId();

    const options: UseJsonValidationOptions = React.useMemo(
        () => ({
            debounceMs,
            allowEmpty,
            expectedType,
        }),
        [debounceMs, allowEmpty, expectedType]
    );

    const {
        text,
        setText,
        error,
        isValid,
        isPending,
    } = useJsonValidation(value, onChange, options);

    // Notify parent of error state changes
    React.useEffect(() => {
        onError?.(error);
    }, [error, onError]);

    // Determine border color based on state
    const getBorderClass = () => {
        if (disabled) return '';
        if (error) return 'border-red-500 focus:border-red-500 focus:ring-red-500/20';
        if (isPending) return 'border-amber-400';
        if (isValid && text.trim()) return 'border-green-500';
        return '';
    };

    return (
        <div className="space-y-1.5">
            {label && (
                <div className="flex items-center justify-between">
                    <Label htmlFor={fieldId} className="text-sm font-medium">
                        {label}
                    </Label>
                    {showStatus && text.trim() && !disabled && (
                        <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                                error
                                    ? 'bg-red-100 text-red-700'
                                    : isPending
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-green-100 text-green-700'
                            }`}
                        >
                            {error ? 'Invalid' : isPending ? 'Validating...' : 'Valid JSON'}
                        </span>
                    )}
                </div>
            )}

            <Textarea
                id={fieldId}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                disabled={disabled}
                className={`font-mono text-xs ${getBorderClass()} ${className}`}
            />

            {/* Error message */}
            {error && (
                <div className="flex items-start gap-1.5 text-red-600">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <p className="text-xs">{error.message}</p>
                </div>
            )}

            {/* Description (only show if no error) */}
            {description && !error && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}

/**
 * Lightweight inline JSON textarea without label/description
 * Useful for embedding in other forms where labels are handled externally
 */
export interface InlineJsonTextareaProps {
    value: unknown;
    onChange: (value: unknown) => void;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    className?: string;
    debounceMs?: number;
    allowEmpty?: boolean;
    expectedType?: 'object' | 'array' | 'any';
}

export function InlineJsonTextarea({
    value,
    onChange,
    placeholder = '{}',
    rows = 4,
    disabled = false,
    className = '',
    debounceMs = 300,
    allowEmpty = true,
    expectedType = 'any',
}: InlineJsonTextareaProps) {
    const options: UseJsonValidationOptions = React.useMemo(
        () => ({
            debounceMs,
            allowEmpty,
            expectedType,
        }),
        [debounceMs, allowEmpty, expectedType]
    );

    const { text, setText, error } = useJsonValidation(value, onChange, options);

    const getBorderClass = () => {
        if (disabled) return '';
        if (error) return 'border-red-500 focus:border-red-500';
        return '';
    };

    return (
        <div className="space-y-1">
            <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                disabled={disabled}
                className={`font-mono text-xs ${getBorderClass()} ${className}`}
            />
            {error && (
                <p className="text-xs text-red-500">{error.message}</p>
            )}
        </div>
    );
}

export default JsonTextarea;
