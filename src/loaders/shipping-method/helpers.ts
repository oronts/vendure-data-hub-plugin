import { ConfigurableOperationInput } from './types';

export function buildConfigurableOperation(
    input: { code: string; args: Record<string, unknown> },
): ConfigurableOperationInput {
    return {
        code: input.code,
        arguments: Object.entries(input.args || {}).map(([name, value]) => ({
            name,
            value: typeof value === 'string' ? value : JSON.stringify(value),
        })),
    };
}

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

export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}
