import { describe, expect, it } from 'vitest';
import {
    prepareSecretCreateInput,
    prepareSecretUpdateInput,
    getSecretValueValidationIssue,
    SecretFormInputError,
} from './secret-form-input';

describe('secret form input serialization', () => {
    it('validates ENV names without silently trimming server-significant input', () => {
        expect(getSecretValueValidationIssue({
            value: ' API_KEY ',
            provider: 'ENV',
            existingProvider: 'ENV',
            creating: true,
            clearValue: false,
        })).toBe('INVALID_ENV_NAME');
        expect(getSecretValueValidationIssue({
            value: 'API_KEY',
            provider: 'ENV',
            existingProvider: 'ENV',
            creating: true,
            clearValue: false,
        })).toBeNull();
        expect(getSecretValueValidationIssue({
            value: '   ',
            provider: 'ENV',
            existingProvider: 'ENV',
            creating: false,
            clearValue: false,
        })).toBe('INVALID_ENV_NAME');
    });

    it('requires a replacement when creating or changing provider', () => {
        expect(getSecretValueValidationIssue({
            value: '',
            provider: 'INLINE',
            existingProvider: 'ENV',
            creating: false,
            clearValue: false,
        })).toBe('INLINE_VALUE_REQUIRED');
        expect(getSecretValueValidationIssue({
            value: '',
            provider: 'ENV',
            existingProvider: 'ENV',
            creating: false,
            clearValue: true,
        })).toBeNull();
        expect(getSecretValueValidationIssue({
            value: '',
            provider: 'ENV',
            existingProvider: 'ENV',
            creating: true,
            clearValue: true,
        })).toBe('ENV_NAME_REQUIRED');
    });

    it('requires a value and defaults create input to the ENV provider', () => {
        expect(() =>
            prepareSecretCreateInput({
                code: 'supplier-token',
                provider: '',
                value: '',
            }),
        ).toThrow(
            expect.objectContaining<Partial<SecretFormInputError>>({
                code: 'VALUE_REQUIRED',
            }),
        );

        expect(
            prepareSecretCreateInput({
                code: 'supplier-token',
                provider: '',
                value: 'SUPPLIER_TOKEN',
            }),
        ).toEqual({
            code: 'supplier-token',
            provider: 'ENV',
            value: 'SUPPLIER_TOKEN',
        });
    });

    it('omits blank, null, and undefined update values to retain the secret', () => {
        for (const value of ['', null, undefined]) {
            expect(
                prepareSecretUpdateInput({
                    id: 1,
                    value,
                    clearValue: false,
                }),
            ).toEqual({ id: 1 });
        }
    });

    it('preserves replacement bytes without trimming', () => {
        expect(
            prepareSecretUpdateInput({
                id: 1,
                value: '  replacement value  ',
            }),
        ).toEqual({
            id: 1,
            value: '  replacement value  ',
        });
    });

    it('serializes explicit clear intent without a value', () => {
        expect(
            prepareSecretUpdateInput({
                id: 1,
                value: '',
                clearValue: true,
            }),
        ).toEqual({
            id: 1,
            clearValue: true,
        });
    });

    it('rejects impossible simultaneous replacement and clear intent', () => {
        expect(() =>
            prepareSecretUpdateInput({
                id: 1,
                value: 'replacement',
                clearValue: true,
            }),
        ).toThrow(
            expect.objectContaining<Partial<SecretFormInputError>>({
                code: 'CONFLICTING_VALUE_ACTIONS',
            }),
        );
    });

    it('preserves explicit metadata null', () => {
        expect(
            prepareSecretUpdateInput({
                id: 1,
                metadata: null,
            }),
        ).toEqual({
            id: 1,
            metadata: null,
        });
    });
});
