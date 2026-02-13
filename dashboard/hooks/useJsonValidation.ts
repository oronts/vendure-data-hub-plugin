import * as React from 'react';
import { DEBOUNCE_DELAYS } from '../constants';
import { ERROR_MESSAGES } from '../constants/validation-patterns';

export interface JsonValidationError {
    message: string;
    position?: number;
    line?: number;
    column?: number;
}

export interface UseJsonValidationOptions {
    debounceMs?: number;
    allowEmpty?: boolean;
    expectedType?: 'object' | 'array' | 'any';
}

interface UseJsonValidationResult {
    text: string;
    setText: (value: string) => void;
    parsedValue: unknown;
    error: JsonValidationError | null;
    isValid: boolean;
    isPending: boolean;
    validateNow: () => JsonValidationError | null;
}

function parseJsonWithDetails(text: string): { value: unknown; error: JsonValidationError | null } {
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

function extractJsonErrorDetails(message: string, text: string): JsonValidationError {
    const positionMatch = message.match(/at position (\d+)/i);
    const position = positionMatch ? parseInt(positionMatch[1], 10) : undefined;

    let line: number | undefined;
    let column: number | undefined;

    if (position !== undefined) {
        const lines = text.substring(0, position).split('\n');
        line = lines.length;
        column = lines[lines.length - 1].length + 1;
    }

    let cleanMessage = message
        .replace(/^JSON\.parse: /, '')
        .replace(/^SyntaxError: /, '')
        .replace(/ in JSON at position \d+/, '')
        .replace(/ at position \d+/, '');

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

export function useJsonValidation(
    initialValue: unknown,
    onChange?: (value: unknown) => void,
    options: UseJsonValidationOptions = {}
): UseJsonValidationResult {
    const {
        debounceMs = DEBOUNCE_DELAYS.DEFAULT,
        allowEmpty = true,
        expectedType = 'any',
    } = options;

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

    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = React.useRef(true);
    const onChangeRef = React.useRef(onChange);
    const textRef = React.useRef(text);

    onChangeRef.current = onChange;
    textRef.current = text;

    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const prevInitialValueJsonRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        let initialValueJson: string | null = null;
        try {
            initialValueJson = initialValue === undefined || initialValue === null
                ? null
                : JSON.stringify(initialValue);
        } catch {
            initialValueJson = null;
        }

        if (prevInitialValueJsonRef.current !== initialValueJson) {
            prevInitialValueJsonRef.current = initialValueJson;
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
                    // Keep current state if stringify fails
                }
            }
        }
    }, [initialValue]);

    const validate = React.useCallback((value: string): JsonValidationError | null => {
        const trimmed = value.trim();

        if (!trimmed) {
            if (allowEmpty) {
                setParsedValue(undefined);
                setError(null);
                onChangeRef.current?.(undefined);
                return null;
            } else {
                const err: JsonValidationError = { message: ERROR_MESSAGES.JSON_REQUIRED };
                setError(err);
                return err;
            }
        }

        const { value: parsed, error: parseError } = parseJsonWithDetails(trimmed);

        if (parseError) {
            setError(parseError);
            return parseError;
        }

        if (expectedType === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null)) {
            const err: JsonValidationError = { message: ERROR_MESSAGES.JSON_OBJECT_EXPECTED };
            setError(err);
            return err;
        }

        if (expectedType === 'array' && !Array.isArray(parsed)) {
            const err: JsonValidationError = { message: ERROR_MESSAGES.JSON_ARRAY_EXPECTED };
            setError(err);
            return err;
        }

        setParsedValue(parsed);
        setError(null);
        onChangeRef.current?.(parsed);
        return null;
    }, [allowEmpty, expectedType]);

    const validateRef = React.useRef(validate);
    validateRef.current = validate;

    const setText = React.useCallback((value: string) => {
        setTextInternal(value);
        setIsPending(true);

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
                validateRef.current(value);
                setIsPending(false);
            }
        }, debounceMs);
    }, [debounceMs]);

    const validateNow = React.useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsPending(false);
        return validateRef.current(textRef.current);
    }, []);

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
