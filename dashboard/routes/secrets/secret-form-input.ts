import type { CreateDataHubSecretInput, UpdateDataHubSecretInput } from '../../types';
import { SECRET_PROVIDER } from '../../constants';

function hasReplacement(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export function prepareSecretCreateInput(input: CreateDataHubSecretInput): CreateDataHubSecretInput {
    if (!hasReplacement(input.value)) {
        throw new Error('A non-empty secret value is required');
    }
    return {
        ...input,
        provider: input.provider || SECRET_PROVIDER.ENV,
        value: input.value,
    };
}

export function prepareSecretUpdateInput(input: UpdateDataHubSecretInput): UpdateDataHubSecretInput {
    const { value, clearValue, ...rest } = input;
    if (hasReplacement(value) && clearValue === true) {
        throw new Error('A secret value cannot be replaced and cleared at the same time');
    }
    if (hasReplacement(value)) {
        return { ...rest, value };
    }
    if (clearValue === true) {
        return { ...rest, clearValue: true };
    }
    return rest;
}
