import { describe, expect, it } from 'vitest';
import {
    buildInitialOperatorArgs,
    isRuleCondition,
    parseJsonArray,
    parseLooseJsonValue,
    parseMapping,
    parseRecord,
    parseRecordArray,
    previewMapping,
    renderTemplate,
} from './editor-utils';

describe('advanced editor JSON contracts', () => {
    it('accepts only safe string-to-string mapping objects', () => {
        expect(parseMapping('{"product.title":"source.name"}')).toEqual({
            'product.title': 'source.name',
        });
        expect(parseMapping('[]')).toBeNull();
        expect(parseMapping('null')).toBeNull();
        expect(parseMapping('{"title":42}')).toBeNull();
        expect(parseMapping('{"__proto__.polluted":"source.name"}')).toBeNull();
        expect(parseMapping('{"title":"constructor.value"}')).toBeNull();
    });

    it('distinguishes records, record arrays, and arbitrary arrays', () => {
        expect(parseRecord('{"sku":"A-1"}')).toEqual({ sku: 'A-1' });
        expect(parseRecord('[{"sku":"A-1"}]')).toBeNull();
        expect(parseRecordArray('[{"sku":"A-1"}]')).toEqual([{ sku: 'A-1' }]);
        expect(parseRecordArray('["A-1"]')).toBeNull();
        expect(parseJsonArray('["A-1"]')).toEqual(['A-1']);
    });

    it('previews nested targets and passthrough without mutating the sample', () => {
        const records = [{ source: { name: 'Alice' }, untouched: true }];
        const result = previewMapping(
            records,
            { 'product.title': 'source.name' },
            true,
        );

        expect(result).toEqual([{
            source: { name: 'Alice' },
            untouched: true,
            product: { title: 'Alice' },
        }]);
        expect(records).toEqual([{ source: { name: 'Alice' }, untouched: true }]);
        expect(result[0]).not.toBe(records[0]);
        expect(result[0].source).not.toBe(records[0].source);
    });

    it('matches runtime template behavior for missing values', () => {
        const record = { name: 'Alice' };

        expect(renderTemplate(record, 'Hello ${name} ${missing}', false))
            .toBe('Hello Alice ${missing}');
        expect(renderTemplate(record, 'Hello ${name} ${missing}', true))
            .toBe('Hello Alice ');
    });

    it('preserves JSON primitive types for generic comparisons', () => {
        expect(parseLooseJsonValue('42')).toBe(42);
        expect(parseLooseJsonValue('true')).toBe(true);
        expect(parseLooseJsonValue('plain text')).toBe('plain text');
    });

    it('clones schema defaults before assigning them to an operator', () => {
        const defaultValue = { fields: ['sku'] };
        const args = buildInitialOperatorArgs([
            { key: 'options', type: 'json', defaultValue },
            { key: 'target', type: 'string', required: true },
        ]);
        const options = args.options as { fields: string[] };
        options.fields.push('name');

        expect(args.target).toBe('');
        expect(defaultValue).toEqual({ fields: ['sku'] });
    });

    it('rejects grouped rule objects from the flat when-operator contract', () => {
        expect(isRuleCondition({ field: 'price', cmp: 'gt', value: 0 })).toBe(true);
        expect(isRuleCondition({ logic: 'AND', rules: [] })).toBe(false);
        expect(isRuleCondition(null)).toBe(false);
    });
});
