import { ConfigurableOperationInput } from './types';

/**
 * Build a configurable operation definition from input
 * Converts user-friendly args to Vendure's expected format
 */
export function buildConfigurableOperation(
    input: ConfigurableOperationInput,
): { code: string; arguments: Array<{ name: string; value: string }> } {
    const args: Array<{ name: string; value: string }> = [];

    if (input.args) {
        for (const [name, value] of Object.entries(input.args)) {
            args.push({
                name,
                value: typeof value === 'string' ? value : JSON.stringify(value),
            });
        }
    }

    return {
        code: input.code,
        arguments: args,
    };
}

/**
 * Check if an error is recoverable (can be retried)
 */
export function isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('connection') ||
            message.includes('temporarily')
        );
    }
    return false;
}

/**
 * Check if a field should be updated based on updateOnlyFields option
 */
export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}
