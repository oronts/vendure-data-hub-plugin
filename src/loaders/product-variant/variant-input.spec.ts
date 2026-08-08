import { GlobalFlag, LanguageCode } from '@vendure/common/lib/generated-types';
import { describe, expect, it } from 'vitest';
import {
    buildCreateVariantTranslations,
    buildVariantUpdateInput,
} from './variant-input';

describe('product variant service inputs', () => {
    it('keeps every create translation and adds the context language once', () => {
        expect(buildCreateVariantTranslations({
            sku: 'SKU-1',
            price: 10,
            translations: [
                { languageCode: LanguageCode.de, name: 'Deutsch' },
            ],
        }, LanguageCode.en)).toEqual([
            { languageCode: LanguageCode.en, name: 'SKU-1' },
            { languageCode: LanguageCode.de, name: 'Deutsch' },
        ]);
    });

    it('does not overwrite a name when a partial update omits translations', () => {
        expect(buildVariantUpdateInput(
            'variant-1',
            {
                sku: 'SKU-1',
                price: 10,
                stockOnHand: 15,
            },
            LanguageCode.en,
            undefined,
        )).toEqual({
            id: 'variant-1',
            sku: 'SKU-1',
            stockOnHand: 15,
        });
    });

    it('updates only explicitly supplied translation languages', () => {
        expect(buildVariantUpdateInput(
            'variant-1',
            {
                sku: 'SKU-1',
                price: 10,
                translations: [
                    { languageCode: LanguageCode.de, name: 'Aktualisiert' },
                ],
            },
            LanguageCode.en,
            undefined,
        )).toEqual({
            id: 'variant-1',
            sku: 'SKU-1',
            translations: [
                { languageCode: LanguageCode.de, name: 'Aktualisiert' },
            ],
        });
    });

    it('uses Vendure global flags only when inventory tracking is explicit', () => {
        expect(buildVariantUpdateInput(
            'variant-1',
            { sku: 'SKU-1', price: 10, trackInventory: false },
            LanguageCode.en,
            undefined,
        )).toMatchObject({ trackInventory: GlobalFlag.FALSE });
    });
});
