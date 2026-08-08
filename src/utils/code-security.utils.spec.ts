import { describe, expect, it } from 'vitest';
import {
    createCodeSandbox,
    validateConditionExpression,
    validateScriptBlock,
    validateUserCode,
} from './code-security.utils';

describe('expression validation', () => {
    it('accepts bounded data expressions', () => {
        expect(() => validateUserCode("record.total >= 10 && record.status === 'active'"))
            .not.toThrow();
        expect(() => validateConditionExpression('record.enabled === true'))
            .not.toThrow();
    });

    it.each([
        ['record.value; process.exit()', 'disallowed patterns'],
        ['record./* hidden */value', 'disallowed comment syntax'],
        ['record["con" + "structor"]', 'computed property access'],
        ['record.constructor.name', 'disallowed keyword: constructor'],
        ['record.__proto__', 'disallowed keyword: __proto__'],
    ])('rejects unsafe expression %s', (code, message) => {
        expect(() => validateUserCode(code)).toThrow(message);
    });

    it('enforces configured length, complexity, and property-access limits', () => {
        expect(() => validateUserCode('record.value', { maxCodeLength: 5 }))
            .toThrow('maximum length of 5');
        expect(() => validateUserCode('((((record.value))))', {
            maxExpressionComplexity: 2,
        })).toThrow('Expression complexity');
        expect(() => validateUserCode('record.customer.address.city', {
            maxPropertyAccessDepth: 2,
        })).toThrow('Property access depth');
    });

    it('applies the stricter condition character contract', () => {
        expect(() => validateConditionExpression('record.name ?? "unknown"', {
            maxConditionLength: 5,
        })).toThrow('Condition exceeds maximum length of 5');
        expect(() => validateConditionExpression('record.name\\value'))
            .toThrow('Condition contains invalid characters');
    });
});

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

    it('allows local classes while blocking host-runtime access', () => {
        expect(() => validateScriptBlock(`
            class Price { static value() { return 10; } }
            record.price = Price.value();
        `)).not.toThrow();
        expect(() => validateScriptBlock('record.cwd = process.cwd();'))
            .toThrow('Code contains disallowed keyword: process');
    });
});

describe('code sandbox', () => {
    it('exposes frozen safe wrappers and date behavior', () => {
        const sandbox = createCodeSandbox();
        const secondSandbox = createCodeSandbox();
        const SafeDate = sandbox.Date as DateConstructor;

        expect(Object.isFrozen(sandbox)).toBe(true);
        expect(secondSandbox.Date).not.toBe(sandbox.Date);
        expect((sandbox.keys as (value: object) => string[])({ sku: 'A' }))
            .toEqual(['sku']);
        expect(new SafeDate('2026-07-28T00:00:00.000Z').toISOString())
            .toBe('2026-07-28T00:00:00.000Z');
    });

    it('sanitizes additional objects and dangerous global names', () => {
        const input = JSON.parse('{"safe":{"value":1},"__proto__":{"polluted":true}}');
        const sandbox = createCodeSandbox({
            input,
            process: 'blocked',
            helper: (value: number) => value + 1,
        });
        const sanitized = sandbox.input as Record<string, unknown>;

        expect(sandbox.process).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(false);
        expect((sandbox.helper as (value: number) => number)(2)).toBe(3);
        expect(Reflect.get(sandbox.helper as object, 'constructor')).toBeUndefined();
    });

    it('rejects unsafe wrapper inputs and property keys', () => {
        const sandbox = createCodeSandbox();
        const SafeArray = sandbox.Array as {
            from(value: unknown): unknown[];
        };
        const SafeObject = sandbox.Object as {
            hasOwn(value: object, key: string): boolean;
        };

        expect(() => SafeArray.from({})).toThrow('only accepts arrays or strings');
        expect(SafeObject.hasOwn({}, 'constructor')).toBe(false);
    });
});
