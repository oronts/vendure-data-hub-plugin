import { describe, expect, it } from 'vitest';
import { validateScriptBlock } from './code-security.utils';

describe('validateScriptBlock', () => {
    it('allows arguments as an object property name', () => {
        expect(() => validateScriptBlock(`
            record.actions = [{
                code: 'order_percentage_discount',
                arguments: [{ name: 'discount', value: '10' }],
            }];
        `)).not.toThrow();
    });

    it('rejects access to the function arguments object', () => {
        expect(() => validateScriptBlock('record.value = arguments[0];'))
            .toThrow('Code contains disallowed keyword: arguments');
    });
});
