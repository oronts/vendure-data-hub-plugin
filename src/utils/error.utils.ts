export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

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

export function wrapError(error: unknown, context: string): Error {
    const message = getErrorMessage(error);
    const wrapped = new Error(`${context}: ${message}`);
    if (error instanceof Error && error.stack) {
        wrapped.stack = error.stack;
    }
    return wrapped;
}
