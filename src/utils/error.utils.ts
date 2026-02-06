/**
 * Error Utilities
 *
 * Common error handling and transformation utilities.
 */

/**
 * Extract error message from unknown error type.
 *
 * Safely extracts the message from Error objects or converts other types to string.
 * Consolidates the common pattern: `error instanceof Error ? error.message : String(error)`
 *
 * @param error - Unknown error value
 * @returns Error message string
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   logger.error(getErrorMessage(error));
 * }
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * Extract full error details including stack trace when available.
 *
 * @param error - Unknown error value
 * @returns Object with message and optional stack
 */
export function getErrorDetails(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack,
        };
    }
    return {
        message: String(error),
    };
}

/**
 * Wrap an error with additional context.
 *
 * @param error - Original error
 * @param context - Additional context to prepend
 * @returns New error with context
 */
export function wrapError(error: unknown, context: string): Error {
    const message = getErrorMessage(error);
    const wrapped = new Error(`${context}: ${message}`);
    if (error instanceof Error && error.stack) {
        wrapped.stack = error.stack;
    }
    return wrapped;
}
