/**
 * useJsonValidation Hook
 *
 * Provides debounced JSON validation with detailed error messages.
 * Used by JSON input fields to show validation errors only after the user
 * stops typing, avoiding disruptive error flashing while typing.
 */

import * as React from 'react';

export interface JsonValidationError {
    message: string;
    position?: number;
    line?: number;
    column?: number;
}

export interface UseJsonValidationOptions {
    /** Debounce delay in milliseconds. Default: 300ms */
    debounceMs?: number;
    /** Whether empty values are allowed. Default: true */
    allowEmpty?: boolean;
    /** Expected type: 'object', 'array', or 'any'. Default: 'any' */
    expectedType?: 'object' | 'array' | 'any';
}

export interface UseJsonValidationResult {
    /** The current text value */
    text: string;
    /** Set the text value */
    setText: (value: string) => void;
    /** The parsed JSON value (undefined if invalid or empty) */
    parsedValue: unknown;
    /** Current validation error (null if valid) */
    error: JsonValidationError | null;
    /** Whether the input is currently valid JSON */
    isValid: boolean;
    /** Whether validation is pending (user is typing) */
    isPending: boolean;
    /** Force immediate validation */
    validateNow: () => JsonValidationError | null;
}

/**
 * Parses a JSON string and returns detailed error information if invalid.
 */
export function parseJsonWithDetails(text: string): { value: unknown; error: JsonValidationError | null } {
    if (!text.trim()) {
        return { value: undefined, error: null };
    }

    try {
        const value = JSON.parse(text);
        return { value, error: null };
    } catch (e) {
        const error = e as SyntaxError;
        const errorInfo = extractJsonErrorDetails(error.message, text);
        return { value: undefined, error: errorInfo };
    }
}

/**
 * Extracts detailed position information from JSON parse errors.
 */
function extractJsonErrorDetails(message: string, text: string): JsonValidationError {
    // Try to extract position from error message
    // Common formats:
    // - "Unexpected token X at position Y"
    // - "Unexpected token X in JSON at position Y"
    // - "Expected property name or '}' in JSON at position Y"
    const positionMatch = message.match(/at position (\d+)/i);
    const position = positionMatch ? parseInt(positionMatch[1], 10) : undefined;

    let line: number | undefined;
    let column: number | undefined;

    if (position !== undefined) {
        // Calculate line and column from position
        const lines = text.substring(0, position).split('\n');
        line = lines.length;
        column = lines[lines.length - 1].length + 1;
    }

    // Clean up the error message for user display
    let cleanMessage = message
        .replace(/^JSON\.parse: /, '')
        .replace(/^SyntaxError: /, '')
        .replace(/ in JSON at position \d+/, '')
        .replace(/ at position \d+/, '');

    // Make common errors more readable
    if (cleanMessage.includes('Unexpected token')) {
        const tokenMatch = cleanMessage.match(/Unexpected token (.)/);
        if (tokenMatch) {
            const token = tokenMatch[1];
            if (token === '}') {
                cleanMessage = 'Unexpected closing brace }';
            } else if (token === ']') {
                cleanMessage = 'Unexpected closing bracket ]';
            } else if (token === ',') {
                cleanMessage = 'Unexpected comma - check for trailing commas';
            } else {
                cleanMessage = `Unexpected character "${token}"`;
            }
        }
    } else if (cleanMessage.includes('Unexpected end')) {
        cleanMessage = 'Incomplete JSON - missing closing bracket or brace';
    } else if (cleanMessage.includes("Expected property name or '}'")) {
        cleanMessage = 'Expected property name - check for trailing commas';
    } else if (cleanMessage.includes("Expected ',' or '}'")) {
        cleanMessage = 'Missing comma between properties';
    } else if (cleanMessage.includes("Expected ',' or ']'")) {
        cleanMessage = 'Missing comma between array items';
    }

    // Build final message with position info
    let finalMessage = `Invalid JSON: ${cleanMessage}`;
    if (line !== undefined && column !== undefined) {
        finalMessage += ` (line ${line}, column ${column})`;
    } else if (position !== undefined) {
        finalMessage += ` (position ${position})`;
    }

    return {
        message: finalMessage,
        position,
        line,
        column,
    };
}

/**
 * Hook for JSON input validation with debouncing.
 */
export function useJsonValidation(
    initialValue: unknown,
    onChange?: (value: unknown) => void,
    options: UseJsonValidationOptions = {}
): UseJsonValidationResult {
    const {
        debounceMs = 300,
        allowEmpty = true,
        expectedType = 'any',
    } = options;

    // Initialize text from value
    const [text, setTextInternal] = React.useState(() => {
        if (initialValue === undefined || initialValue === null) {
            return '';
        }
        try {
            return JSON.stringify(initialValue, null, 2);
        } catch {
            return '';
        }
    });

    const [parsedValue, setParsedValue] = React.useState<unknown>(initialValue);
    const [error, setError] = React.useState<JsonValidationError | null>(null);
    const [isPending, setIsPending] = React.useState(false);

    // Track the timeout for cleanup
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track if component is mounted
    const mountedRef = React.useRef(true);
    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // Sync with external value changes
    const prevInitialValueRef = React.useRef(initialValue);
    React.useEffect(() => {
        if (prevInitialValueRef.current !== initialValue) {
            prevInitialValueRef.current = initialValue;
            if (initialValue === undefined || initialValue === null) {
                setTextInternal('');
                setParsedValue(undefined);
                setError(null);
            } else {
                try {
                    const newText = JSON.stringify(initialValue, null, 2);
                    setTextInternal(newText);
                    setParsedValue(initialValue);
                    setError(null);
                } catch {
                    // Keep current text if serialization fails
                }
            }
        }
    }, [initialValue]);

    // Validate function
    const validate = React.useCallback((value: string): JsonValidationError | null => {
        const trimmed = value.trim();

        // Handle empty
        if (!trimmed) {
            if (allowEmpty) {
                setParsedValue(undefined);
                setError(null);
                onChange?.(undefined);
                return null;
            } else {
                const err: JsonValidationError = { message: 'JSON value is required' };
                setError(err);
                return err;
            }
        }

        // Parse and validate
        const { value: parsed, error: parseError } = parseJsonWithDetails(trimmed);

        if (parseError) {
            setError(parseError);
            return parseError;
        }

        // Type validation
        if (expectedType === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null)) {
            const err: JsonValidationError = { message: 'Value must be a JSON object' };
            setError(err);
            return err;
        }

        if (expectedType === 'array' && !Array.isArray(parsed)) {
            const err: JsonValidationError = { message: 'Value must be a JSON array' };
            setError(err);
            return err;
        }

        // Valid!
        setParsedValue(parsed);
        setError(null);
        onChange?.(parsed);
        return null;
    }, [allowEmpty, expectedType, onChange]);

    // Set text with debounced validation
    const setText = React.useCallback((value: string) => {
        setTextInternal(value);
        setIsPending(true);

        // Clear existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Set new timeout
        timeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
                validate(value);
                setIsPending(false);
            }
        }, debounceMs);
    }, [debounceMs, validate]);

    // Force immediate validation
    const validateNow = React.useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsPending(false);
        return validate(text);
    }, [text, validate]);

    return {
        text,
        setText,
        parsedValue,
        error,
        isValid: error === null && !isPending,
        isPending,
        validateNow,
    };
}

export default useJsonValidation;
