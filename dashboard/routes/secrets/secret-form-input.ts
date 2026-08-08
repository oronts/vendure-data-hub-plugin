import type { CreateDataHubSecretInput, UpdateDataHubSecretInput } from '../../types';
import { SECRET_PROVIDER } from '../../constants';
import { ENV_VARIABLE_NAME_PATTERN } from '../../../shared';

export type SecretFormInputErrorCode =
    | 'VALUE_REQUIRED'
    | 'CONFLICTING_VALUE_ACTIONS';

export class SecretFormInputError extends Error {
    constructor(readonly code: SecretFormInputErrorCode) {
        super(code);
        this.name = 'SecretFormInputError';
    }
}

export type SecretValueValidationIssue =
    | 'ENV_NAME_REQUIRED'
    | 'INLINE_VALUE_REQUIRED'
    | 'INVALID_ENV_NAME';

interface SecretValueValidationInput {
    readonly value?: string;
    readonly provider: 'INLINE' | 'ENV';
    readonly existingProvider: 'INLINE' | 'ENV';
    readonly creating: boolean;
    readonly clearValue: boolean;
}

export function getSecretValueValidationIssue({
    value,
    provider,
    existingProvider,
    creating,
    clearValue,
}: SecretValueValidationInput): SecretValueValidationIssue | null {
    const candidate = value ?? '';
    const replacementProvided = candidate.trim().length > 0;
    const providerWillChange = !creating && provider !== existingProvider;

    if (!creating && clearValue && !providerWillChange) return null;
    if ((creating || providerWillChange) && !replacementProvided) {
        return provider === SECRET_PROVIDER.ENV
            ? 'ENV_NAME_REQUIRED'
            : 'INLINE_VALUE_REQUIRED';
    }
    if (
        provider === SECRET_PROVIDER.ENV
        && candidate.length > 0
        && !ENV_VARIABLE_NAME_PATTERN.test(candidate)
    ) {
        return 'INVALID_ENV_NAME';
    }
    return null;
}

function hasReplacement(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export function prepareSecretCreateInput(input: CreateDataHubSecretInput): CreateDataHubSecretInput {
    if (!hasReplacement(input.value)) {
        throw new SecretFormInputError('VALUE_REQUIRED');
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
        throw new SecretFormInputError('CONFLICTING_VALUE_ACTIONS');
    }
    if (hasReplacement(value)) {
        return { ...rest, value };
    }
    if (clearValue === true) {
        return { ...rest, clearValue: true };
    }
    return rest;
}
