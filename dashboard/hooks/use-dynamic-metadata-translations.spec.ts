import { describe, expect, it, vi } from 'vitest';
import { translateKnownMetadata } from './use-dynamic-metadata-translations';

describe('translateKnownMetadata', () => {
    it('returns a catalog translation for known metadata', () => {
        const translate = vi.fn(() => 'Produkte');

        expect(translateKnownMetadata(
            translate,
            'entity',
            'product',
            'name',
            'Products',
            true,
        )).toBe('Produkte');
    });

    it('preserves the server value when the catalog has no entry', () => {
        const translate = (id: string) => id;

        expect(translateKnownMetadata(
            translate,
            'adapter',
            'EXTRACTOR:future',
            'description',
            'Server-owned description',
            true,
        )).toBe('Server-owned description');
    });

    it('does not translate custom metadata', () => {
        const translate = vi.fn(() => 'Unexpected');

        expect(translateKnownMetadata(
            translate,
            'importTemplate',
            'custom-template',
            'name',
            'Custom template',
            false,
        )).toBe('Custom template');
        expect(translate).not.toHaveBeenCalled();
    });
});
