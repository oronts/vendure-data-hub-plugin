import { describe, expect, it, vi } from 'vitest';
import { IMPORT_WIZARD_TRANSLATION_IDS } from '../../../constants';
import { summarizeConfig } from './transform-config-summary';

describe('summarizeConfig', () => {
    it('formats field moves and bounded generic values', () => {
        const translate = vi.fn((id: string) => id);

        expect(summarizeConfig('rename', { from: 'source', to: 'target' }, translate))
            .toBe('source → target');
        expect(summarizeConfig('custom', { value: '12345678901234567890' }, translate))
            .toBe('value: 123456789012345…');
        expect(translate).not.toHaveBeenCalled();
    });

    it('uses the localized rule summary with the exact rule count', () => {
        const translate = vi.fn((_id: string, values?: Record<string, unknown>) => (
            `${String(values?.action)}:${String(values?.count)}`
        ));

        expect(summarizeConfig('filter', {
            action: 'KEEP',
            conditions: [{ field: 'enabled' }, { field: 'stock' }],
        }, translate)).toBe('KEEP:2');
        expect(translate).toHaveBeenCalledWith(
            IMPORT_WIZARD_TRANSLATION_IDS.TRANSFORM_SUMMARY_RULE_MULTIPLE,
            { action: 'KEEP', count: 2 },
        );
    });

    it('returns an empty summary when no configured value is present', () => {
        expect(summarizeConfig('set', { value: '', optional: null }, id => id)).toBe('');
    });
});
