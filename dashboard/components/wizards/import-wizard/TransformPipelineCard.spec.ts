import { describe, expect, it, vi } from 'vitest';
import { summarizeConfig } from './transform-config-summary';

const messages = {
    empty: '(empty)',
    remove: (fields: string) => `Remove: ${fields}`,
    keep: (fields: string) => `Keep: ${fields}`,
    rule: (action: string, count: number) => `${action}:${count}`,
    lookup: (field: string) => `Lookup: ${field}`,
    fields: (count: number) => `${count} fields configured`,
};

describe('summarizeConfig', () => {
    it('formats field moves and bounded generic values', () => {
        expect(summarizeConfig('rename', { from: 'source', to: 'target' }, messages))
            .toBe('source → target');
        expect(summarizeConfig('custom', { value: '12345678901234567890' }, messages))
            .toBe('value: 123456789012345…');
    });

    it('uses the localized rule summary with the exact rule count', () => {
        const rule = vi.fn(messages.rule);

        expect(summarizeConfig('filter', {
            action: 'KEEP',
            conditions: [{ field: 'enabled' }, { field: 'stock' }],
        }, { ...messages, rule })).toBe('KEEP:2');
        expect(rule).toHaveBeenCalledWith('KEEP', 2);
    });

    it('returns an empty summary when no configured value is present', () => {
        expect(summarizeConfig('set', { value: '', optional: null }, messages)).toBe('');
    });
});
