/**
 * Extracts a human-readable error message from an unknown caught value.
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * Converts an unknown caught value into an Error instance.
 * Returns the value as-is if already an Error, otherwise wraps via String().
 */
export function ensureError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * Returns the error if it's an Error instance, otherwise undefined.
 * Useful for Vendure logger calls that accept `Error | undefined` as second arg.
 */
export function toErrorOrUndefined(error: unknown): Error | undefined {
    return error instanceof Error ? error : undefined;
}
