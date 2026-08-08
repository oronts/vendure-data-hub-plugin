import type {
    CreateProductVariantInput,
    UpdateProductVariantInput,
} from '@vendure/common/lib/generated-types';
import type { ID, LanguageCode } from '@vendure/core';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import { shouldUpdateField } from '../shared-helpers';
import type { ProductVariantInput } from './types';

type VariantTranslation = CreateProductVariantInput['translations'][number];

export function buildCreateVariantTranslations(
    record: ProductVariantInput,
    contextLanguageCode: LanguageCode,
): VariantTranslation[] {
    const fallbackName = record.name || record.sku;
    const translations = normalizeTranslations(record, fallbackName);
    if (!translations.some(translation => translation.languageCode === contextLanguageCode)) {
        translations.unshift({
            languageCode: contextLanguageCode,
            name: fallbackName,
        });
    }
    return translations;
}

export function buildVariantUpdateInput(
    id: ID,
    record: ProductVariantInput,
    contextLanguageCode: LanguageCode,
    updateOnlyFields: string[] | undefined,
): UpdateProductVariantInput {
    const input: UpdateProductVariantInput = { id };
    const translations = buildUpdateTranslations(
        record,
        contextLanguageCode,
        updateOnlyFields,
    );
    if (translations.length > 0) input.translations = translations;
    if (record.sku !== undefined && shouldUpdateField('sku', updateOnlyFields)) {
        input.sku = record.sku;
    }
    if (
        record.trackInventory !== undefined
        && shouldUpdateField('trackInventory', updateOnlyFields)
    ) {
        input.trackInventory = record.trackInventory
            ? GlobalFlag.TRUE
            : GlobalFlag.FALSE;
    }
    if (
        record.stockOnHand !== undefined
        && shouldUpdateField('stockOnHand', updateOnlyFields)
    ) {
        input.stockOnHand = record.stockOnHand;
    }
    if (
        record.customFields !== undefined
        && shouldUpdateField('customFields', updateOnlyFields)
    ) {
        input.customFields = record.customFields;
    }
    return input;
}

function buildUpdateTranslations(
    record: ProductVariantInput,
    contextLanguageCode: LanguageCode,
    updateOnlyFields: string[] | undefined,
): VariantTranslation[] {
    const includeTranslations = record.translations !== undefined
        && shouldUpdateField('translations', updateOnlyFields);
    const includeContextName = record.name !== undefined
        && shouldUpdateField('name', updateOnlyFields);
    if (!includeTranslations && !includeContextName) return [];

    const translations = includeTranslations
        ? normalizeTranslations(record, record.name || record.sku)
        : [];
    if (includeContextName) {
        const contextTranslation = translations.find(
            translation => translation.languageCode === contextLanguageCode,
        );
        if (contextTranslation) {
            contextTranslation.name = record.name;
        } else {
            translations.unshift({
                languageCode: contextLanguageCode,
                name: record.name,
            });
        }
    }
    return translations;
}

function normalizeTranslations(
    record: ProductVariantInput,
    fallbackName: string,
): VariantTranslation[] {
    return (record.translations ?? []).map(translation => ({
        languageCode: translation.languageCode as LanguageCode,
        name: translation.name || fallbackName,
    }));
}
