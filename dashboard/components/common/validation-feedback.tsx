/**
 * Validation Feedback Components
 *
 * Reusable components for displaying form validation errors
 * throughout the DataHub dashboard.
 */

import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import type { FieldValidationError, FormValidationResult } from '../../utils/form-validation';

// =============================================================================
// FIELD ERROR DISPLAY
// =============================================================================

interface FieldErrorProps {
    /** Error message to display */
    error?: string | null;
    /** Whether the field has been touched/blurred */
    touched?: boolean;
    /** Show error immediately without waiting for touch */
    showImmediately?: boolean;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Displays a single field validation error below an input
 */
export function FieldError({ error, touched = true, showImmediately = false, className = '' }: FieldErrorProps) {
    if (!error || (!touched && !showImmediately)) return null;

    return (
        <div
            className={`flex items-center gap-1.5 mt-1.5 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200 ${className}`}
            role="alert"
        >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
        </div>
    );
}

// =============================================================================
// FORM ERROR SUMMARY
// =============================================================================

interface FormErrorSummaryProps {
    /** Validation result containing all errors */
    validation?: FormValidationResult | null;
    /** Array of individual errors */
    errors?: FieldValidationError[];
    /** Whether to show the summary */
    show?: boolean;
    /** Title for the error summary */
    title?: string;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Displays a summary of all form validation errors
 */
export function FormErrorSummary({
    validation,
    errors: propErrors,
    show = true,
    title = 'Please fix the following errors',
    className = '',
}: FormErrorSummaryProps) {
    const errors = propErrors ?? validation?.errors ?? [];

    if (!show || errors.length === 0) return null;

    return (
        <div
            className={`rounded-lg border border-destructive/50 bg-destructive/10 p-4 animate-in fade-in slide-in-from-top-2 duration-200 ${className}`}
            role="alert"
            aria-live="polite"
        >
            <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                    <h4 className="font-medium text-destructive mb-2">{title}</h4>
                    <ul className="space-y-1">
                        {errors.map((error, index) => (
                            <li key={`${error.field}-${index}`} className="text-sm text-destructive/90">
                                <span className="font-medium">{formatFieldName(error.field)}:</span>{' '}
                                {error.message}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// INLINE VALIDATION STATUS
// =============================================================================

interface ValidationStatusProps {
    /** Is the field/form valid */
    isValid: boolean | null;
    /** Is validation in progress */
    isValidating?: boolean;
    /** Custom valid message */
    validMessage?: string;
    /** Custom invalid message */
    invalidMessage?: string;
    /** Show status only when invalid */
    showOnlyInvalid?: boolean;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Displays an inline validation status indicator
 */
export function ValidationStatus({
    isValid,
    isValidating = false,
    validMessage = 'Valid',
    invalidMessage = 'Invalid',
    showOnlyInvalid = false,
    className = '',
}: ValidationStatusProps) {
    if (isValidating) {
        return (
            <span className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
                <span className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                Validating...
            </span>
        );
    }

    if (isValid === null) return null;

    if (showOnlyInvalid && isValid) return null;

    if (isValid) {
        return (
            <span className={`inline-flex items-center gap-1.5 text-xs text-emerald-600 ${className}`}>
                <CheckCircle className="w-3.5 h-3.5" />
                {validMessage}
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-1.5 text-xs text-destructive ${className}`}>
            <AlertCircle className="w-3.5 h-3.5" />
            {invalidMessage}
        </span>
    );
}

// =============================================================================
// VALIDATION BADGE
// =============================================================================

interface ValidationBadgeProps {
    /** Number of errors */
    errorCount: number;
    /** Number of warnings */
    warningCount?: number;
    /** On click handler */
    onClick?: () => void;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Displays a clickable badge showing validation error/warning count
 */
export function ValidationBadge({
    errorCount,
    warningCount = 0,
    onClick,
    className = '',
}: ValidationBadgeProps) {
    if (errorCount === 0 && warningCount === 0) {
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 ${className}`}>
                <CheckCircle className="w-3 h-3" />
                Valid
            </span>
        );
    }

    const hasErrors = errorCount > 0;
    const bgColor = hasErrors ? 'bg-destructive/10' : 'bg-amber-100';
    const textColor = hasErrors ? 'text-destructive' : 'text-amber-700';
    const Icon = hasErrors ? AlertCircle : AlertTriangle;

    const content = (
        <>
            <Icon className="w-3 h-3" />
            {hasErrors && <span>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
            {hasErrors && warningCount > 0 && <span className="mx-0.5">|</span>}
            {warningCount > 0 && <span>{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>}
        </>
    );

    if (onClick) {
        return (
            <button
                type="button"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${bgColor} ${textColor} hover:opacity-80 transition-opacity ${className}`}
                onClick={onClick}
            >
                {content}
            </button>
        );
    }

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${bgColor} ${textColor} ${className}`}>
            {content}
        </span>
    );
}

// =============================================================================
// INPUT WITH VALIDATION
// =============================================================================

interface ValidatedInputWrapperProps {
    /** Error message for this field */
    error?: string | null;
    /** Whether the field has been touched */
    touched?: boolean;
    /** Description text */
    description?: string;
    /** Children (the input element) */
    children: React.ReactNode;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Wraps an input with validation error display
 */
export function ValidatedInputWrapper({
    error,
    touched = true,
    description,
    children,
    className = '',
}: ValidatedInputWrapperProps) {
    const hasError = error && touched;

    return (
        <div className={className}>
            <div className={hasError ? '[&>input]:border-destructive [&>input]:focus-visible:ring-destructive' : ''}>
                {children}
            </div>
            {hasError ? (
                <FieldError error={error} touched={touched} />
            ) : description ? (
                <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
        </div>
    );
}

// =============================================================================
// REQUIRED FIELD INDICATOR
// =============================================================================

interface RequiredIndicatorProps {
    /** Additional CSS classes */
    className?: string;
}

/**
 * Shows a red asterisk for required fields
 */
export function RequiredIndicator({ className = '' }: RequiredIndicatorProps) {
    return (
        <span className={`text-destructive ml-0.5 ${className}`} aria-label="required">
            *
        </span>
    );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format a field name for display (e.g., 'baseUrl' -> 'Base URL')
 */
function formatFieldName(field: string): string {
    return field
        // Insert space before capital letters
        .replace(/([A-Z])/g, ' $1')
        // Replace underscores and hyphens with spaces
        .replace(/[_-]/g, ' ')
        // Capitalize first letter
        .replace(/^./, str => str.toUpperCase())
        // Clean up extra spaces
        .replace(/\s+/g, ' ')
        .trim();
}

// =============================================================================
// CUSTOM HOOKS
// =============================================================================

interface UseFieldValidationOptions {
    /** Validate on blur */
    validateOnBlur?: boolean;
    /** Validate on change */
    validateOnChange?: boolean;
    /** Debounce delay for change validation */
    debounceMs?: number;
}

interface UseFieldValidationReturn {
    /** Current error message */
    error: string | null;
    /** Whether field has been touched */
    touched: boolean;
    /** Handle blur event */
    onBlur: () => void;
    /** Handle change event with value */
    onChange: (value: unknown) => void;
    /** Manually trigger validation */
    validate: () => boolean;
    /** Reset validation state */
    reset: () => void;
}

/**
 * Hook for managing single field validation
 */
export function useFieldValidation(
    validator: (value: unknown) => string | null,
    initialValue: unknown,
    options: UseFieldValidationOptions = {}
): UseFieldValidationReturn {
    const { validateOnBlur = true, validateOnChange = false, debounceMs = 300 } = options;

    const [error, setError] = React.useState<string | null>(null);
    const [touched, setTouched] = React.useState(false);
    const [value, setValue] = React.useState(initialValue);
    const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();

    const validate = React.useCallback(() => {
        const validationError = validator(value);
        setError(validationError);
        return validationError === null;
    }, [validator, value]);

    const onBlur = React.useCallback(() => {
        setTouched(true);
        if (validateOnBlur) {
            validate();
        }
    }, [validateOnBlur, validate]);

    const onChange = React.useCallback(
        (newValue: unknown) => {
            setValue(newValue);

            if (validateOnChange) {
                if (debounceRef.current) {
                    clearTimeout(debounceRef.current);
                }
                debounceRef.current = setTimeout(() => {
                    const validationError = validator(newValue);
                    setError(validationError);
                }, debounceMs);
            }
        },
        [validateOnChange, debounceMs, validator]
    );

    const reset = React.useCallback(() => {
        setError(null);
        setTouched(false);
        setValue(initialValue);
    }, [initialValue]);

    React.useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    return { error, touched, onBlur, onChange, validate, reset };
}

/**
 * Hook for managing form-level validation state
 */
export function useFormValidation<T extends Record<string, unknown>>(
    initialData: T,
    validators: Record<keyof T, (value: unknown) => string | null>
) {
    const [errors, setErrors] = React.useState<Partial<Record<keyof T, string>>>({});
    const [touched, setTouched] = React.useState<Partial<Record<keyof T, boolean>>>({});
    const [data, setData] = React.useState<T>(initialData);

    const validateField = React.useCallback(
        (field: keyof T, value: unknown) => {
            const validator = validators[field];
            if (validator) {
                const error = validator(value);
                setErrors(prev => ({
                    ...prev,
                    [field]: error ?? undefined,
                }));
                return error === null;
            }
            return true;
        },
        [validators]
    );

    const validateAll = React.useCallback(() => {
        const newErrors: Partial<Record<keyof T, string>> = {};
        let isValid = true;

        for (const field of Object.keys(validators) as Array<keyof T>) {
            const error = validators[field](data[field]);
            if (error) {
                newErrors[field] = error;
                isValid = false;
            }
        }

        setErrors(newErrors);
        // Mark all fields as touched
        const allTouched = Object.keys(validators).reduce(
            (acc, key) => ({ ...acc, [key]: true }),
            {} as Partial<Record<keyof T, boolean>>
        );
        setTouched(allTouched);

        return isValid;
    }, [validators, data]);

    const setFieldValue = React.useCallback(
        (field: keyof T, value: unknown) => {
            setData(prev => ({ ...prev, [field]: value }));
        },
        []
    );

    const setFieldTouched = React.useCallback(
        (field: keyof T, isTouched: boolean = true) => {
            setTouched(prev => ({ ...prev, [field]: isTouched }));
            if (isTouched) {
                validateField(field, data[field]);
            }
        },
        [validateField, data]
    );

    const reset = React.useCallback(() => {
        setErrors({});
        setTouched({});
        setData(initialData);
    }, [initialData]);

    const isValid = Object.values(errors).every(e => !e);
    const errorCount = Object.values(errors).filter(e => !!e).length;

    return {
        data,
        errors,
        touched,
        isValid,
        errorCount,
        setFieldValue,
        setFieldTouched,
        validateField,
        validateAll,
        reset,
    };
}
