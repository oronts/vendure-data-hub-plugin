import { describe, expect, it } from 'vitest';
import { prepareSecretCreateInput, prepareSecretUpdateInput } from './secret-form-input';

describe('secret form input serialization', () => {
    it('requires a value and defaults create input to the ENV provider', () => {
        expect(() =>
            prepareSecretCreateInput({
                code: 'supplier-token',
                provider: '',
                value: '',
            }),
        ).toThrow(/non-empty secret value is required/);

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
        ).toThrow(/cannot be replaced and cleared/);
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
