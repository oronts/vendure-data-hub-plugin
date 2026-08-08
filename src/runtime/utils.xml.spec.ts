import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { recordsToXml } from './utils';

describe('recordsToXml', () => {
    it('rejects invalid configured element names', () => {
        expect(() => recordsToXml([], 'records><injected', 'record')).toThrow(
            'rootElement must be a valid XML element name',
        );
        expect(() => recordsToXml([], 'records', '1record')).toThrow(
            'itemElement must be a valid XML element name',
        );
    });

    it('sanitizes record keys and escapes values into well-formed XML', () => {
        const xml = recordsToXml([
            { 'name><injected': '<unsafe & value>' },
        ], 'records', 'record');

        expect(XMLValidator.validate(xml)).toBe(true);
        expect(xml).not.toContain('<injected>');
        expect(xml).toContain('&lt;unsafe &amp; value&gt;');
    });

    it('can omit the XML declaration', () => {
        expect(recordsToXml([], 'records', 'record', false)).toBe(
            '<records>\n</records>',
        );
    });
});
