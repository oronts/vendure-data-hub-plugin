import {
    PimcoreProduct,
    PimcoreCategory,
    PimcoreAsset,
    PimcoreVariant,
    PimcoreLocalizedField,
    PimcoreMappingConfig,
    VendureProductInput,
    VendureVariantInput,
    VendureCategoryInput,
} from '../types';
import { JsonObject } from '../../../src/types';
import { priceToCents } from '../utils/security.utils';

const DEFAULT_PRODUCT_MAPPING = {
    skuField: 'sku',
    nameField: 'name',
    slugField: 'slug',
    descriptionField: 'description',
    assetsField: 'images',
    categoriesField: 'categories',
    variantsField: 'variants',
    enabledField: 'published',
};

const DEFAULT_CATEGORY_MAPPING = {
    nameField: 'name',
    slugField: 'slug',
    descriptionField: 'description',
    parentField: 'parent',
    positionField: 'index',
};

const DEFAULT_ASSET_MAPPING = {
    urlField: 'fullPath',
    altField: 'filename',
    filenameField: 'filename',
};

export function extractLocalizedValue(
    field: string | PimcoreLocalizedField | undefined | null,
    language: string,
    fallbackLanguage = 'en',
): string {
    if (!field) return '';
    if (typeof field === 'string') return field;

    if (field[language]) return field[language] as string;
    if (field[fallbackLanguage]) return field[fallbackLanguage] as string;

    const values = Object.values(field).filter(v => v != null);
    return (values[0] as string) ?? '';
}

export function buildTranslations<T extends Record<string, unknown>>(
    source: Record<string, string | PimcoreLocalizedField | undefined | null>,
    fields: Array<keyof T>,
    languages: string[],
): Array<{ languageCode: string } & T> {
    const translations: Array<{ languageCode: string } & T> = [];

    for (const lang of languages) {
        const translation: Record<string, unknown> = { languageCode: lang };
        let hasAllRequired = true;

        for (const field of fields) {
            const value = extractLocalizedValue(source[field as string], lang);
            translation[field as string] = value || '';
            if (!value && field !== 'description') hasAllRequired = false;
        }

        if (hasAllRequired) {
            translations.push(translation as { languageCode: string } & T);
        }
    }

    return translations;
}

export function generateSlug(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[äÄ]/g, 'ae')
        .replace(/[öÖ]/g, 'oe')
        .replace(/[üÜ]/g, 'ue')
        .replace(/[ß]/g, 'ss')
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function transformProduct(
    pimcoreProduct: PimcoreProduct,
    mapping?: PimcoreMappingConfig['product'],
    defaultLanguage = 'en',
    languages: string[] = ['en'],
): VendureProductInput {
    const m = { ...DEFAULT_PRODUCT_MAPPING, ...mapping };

    const sku = String(
        getField(pimcoreProduct, m.skuField) ??
        getField(pimcoreProduct, 'itemNumber') ??
        pimcoreProduct.key ??
        pimcoreProduct.id
    );

    const nameField = getField(pimcoreProduct, m.nameField);
    const name = extractLocalizedValue(nameField as string | PimcoreLocalizedField, defaultLanguage);

    const slugField = getField(pimcoreProduct, m.slugField) ?? getField(pimcoreProduct, 'urlKey');
    let slug = extractLocalizedValue(slugField as string | PimcoreLocalizedField, defaultLanguage);
    if (!slug) slug = generateSlug(name || sku);

    const descField = getField(pimcoreProduct, m.descriptionField);
    const description = extractLocalizedValue(descField as string | PimcoreLocalizedField, defaultLanguage);

    const enabledField = getField(pimcoreProduct, m.enabledField);
    const enabled = enabledField !== false && enabledField !== 'false' && enabledField !== 0;

    const result: VendureProductInput = {
        externalId: `pimcore:product:${pimcoreProduct.id}`,
        name: name || sku,
        slug,
        description,
        enabled,
    };

    if (languages.length > 1) {
        result.translations = buildTranslations(
            { name: nameField as string | PimcoreLocalizedField, slug: slugField as string | PimcoreLocalizedField, description: descField as string | PimcoreLocalizedField },
            ['name', 'slug', 'description'],
            languages,
        );
    }

    const assets = getField(pimcoreProduct, m.assetsField) as Array<{ id: string | number }> | undefined;
    if (assets?.length) {
        result.assetIds = assets.map(a => `pimcore:asset:${a.id}`);
        result.featuredAssetId = result.assetIds[0];
    }

    if (mapping?.customFields) {
        result.customFields = {};
        for (const [vendureField, pimcoreField] of Object.entries(mapping.customFields)) {
            const value = getField(pimcoreProduct, pimcoreField);
            if (value !== undefined) result.customFields[vendureField] = value;
        }
    }

    return result;
}

export function transformVariant(
    pimcoreVariant: PimcoreVariant,
    parentSku: string,
    mapping?: PimcoreMappingConfig['product'],
    defaultLanguage = 'en',
    languages: string[] = ['en'],
): VendureVariantInput {
    const m = { ...DEFAULT_PRODUCT_MAPPING, ...mapping };

    const sku = String(
        getField(pimcoreVariant, m.skuField) ??
        getField(pimcoreVariant, 'itemNumber') ??
        `${parentSku}-${pimcoreVariant.key ?? pimcoreVariant.id}`
    );

    const nameField = getField(pimcoreVariant, m.nameField);
    const name = extractLocalizedValue(nameField as string | PimcoreLocalizedField, defaultLanguage) || sku;

    const rawPrice = getField(pimcoreVariant, 'price') as number | string | undefined;
    const price = priceToCents(rawPrice);
    const stockQuantity = getField(pimcoreVariant, 'stockQuantity') as number | undefined;

    const result: VendureVariantInput = {
        externalId: `pimcore:variant:${pimcoreVariant.id}`,
        sku,
        name,
        price,
        enabled: pimcoreVariant.published !== false,
        stockOnHand: stockQuantity ?? 0,
        trackInventory: true,
    };

    const options = pimcoreVariant.options;
    if (options && typeof options === 'object') {
        result.options = Object.entries(options).map(([code, value]) => ({ code, value: String(value) }));
    }

    if (languages.length > 1) {
        result.translations = buildTranslations({ name: nameField as string | PimcoreLocalizedField }, ['name'], languages);
    }

    return result;
}

export function transformCategory(
    pimcoreCategory: PimcoreCategory,
    mapping?: PimcoreMappingConfig['category'],
    defaultLanguage = 'en',
    languages: string[] = ['en'],
): VendureCategoryInput {
    const m = { ...DEFAULT_CATEGORY_MAPPING, ...mapping };

    const nameField = getField(pimcoreCategory, m.nameField);
    const name = extractLocalizedValue(nameField as string | PimcoreLocalizedField, defaultLanguage) ||
        pimcoreCategory.key || String(pimcoreCategory.id);

    const slugField = getField(pimcoreCategory, m.slugField);
    let slug = extractLocalizedValue(slugField as string | PimcoreLocalizedField, defaultLanguage);
    if (!slug) slug = generateSlug(name);

    const descField = getField(pimcoreCategory, m.descriptionField);
    const description = extractLocalizedValue(descField as string | PimcoreLocalizedField, defaultLanguage);

    const parent = getField(pimcoreCategory, m.parentField) as { id: string | number } | undefined;
    const parentExternalId = parent?.id ? `pimcore:category:${parent.id}` : undefined;
    const position = getField(pimcoreCategory, m.positionField) as number | undefined;

    const result: VendureCategoryInput = {
        externalId: `pimcore:category:${pimcoreCategory.id}`,
        name,
        slug,
        description,
        parentExternalId,
        position: position ?? pimcoreCategory.index,
        isPrivate: pimcoreCategory.published === false,
    };

    if (languages.length > 1) {
        result.translations = buildTranslations(
            { name: nameField as string | PimcoreLocalizedField, slug: slugField as string | PimcoreLocalizedField, description: descField as string | PimcoreLocalizedField },
            ['name', 'slug', 'description'],
            languages,
        );
    }

    if (pimcoreCategory.image?.id) {
        result.featuredAssetId = `pimcore:asset:${pimcoreCategory.image.id}`;
    }

    return result;
}

export function transformAsset(
    pimcoreAsset: PimcoreAsset,
    mapping?: PimcoreMappingConfig['asset'],
    baseUrl?: string,
): JsonObject {
    const m = { ...DEFAULT_ASSET_MAPPING, ...mapping };

    let url = getField(pimcoreAsset, m.urlField) as string | undefined;
    if (url && baseUrl && !url.startsWith('http')) {
        url = `${baseUrl.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    const alt = getField(pimcoreAsset, m.altField) as string | undefined;
    let metaAlt: string | undefined;
    if (pimcoreAsset.metadata) {
        const altMeta = pimcoreAsset.metadata.find(m => m.name === 'alt' || m.name === 'title');
        if (altMeta) metaAlt = String(altMeta.data);
    }

    const result: JsonObject = {
        externalId: `pimcore:asset:${pimcoreAsset.id}`,
        url: url ?? pimcoreAsset.fullPath,
        filename: pimcoreAsset.filename,
        alt: metaAlt ?? alt ?? pimcoreAsset.filename,
    };
    if (pimcoreAsset.mimetype) result.mimeType = pimcoreAsset.mimetype;
    if (pimcoreAsset.width != null) result.width = pimcoreAsset.width;
    if (pimcoreAsset.height != null) result.height = pimcoreAsset.height;
    if (pimcoreAsset.filesize != null) result.fileSize = pimcoreAsset.filesize;
    return result;
}

function getField(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

export function createPimcoreTransformOperators(
    _mapping?: PimcoreMappingConfig,
    _defaultLanguage = 'en',
    _languages: string[] = ['en'],
) {
    return {
        transformProduct: {
            op: 'custom',
            args: {
                name: 'pimcore:transformProduct',
                code: `return records.map(record => ({ ...record, ...transformProduct(record, mapping?.product, defaultLanguage, languages), _pimcoreOriginal: record }));`,
            },
        },
        transformCategory: {
            op: 'custom',
            args: {
                name: 'pimcore:transformCategory',
                code: `return records.map(record => ({ ...record, ...transformCategory(record, mapping?.category, defaultLanguage, languages), _pimcoreOriginal: record }));`,
            },
        },
        flattenVariants: {
            op: 'custom',
            args: {
                name: 'pimcore:flattenVariants',
                code: `
                    const result = [];
                    for (const record of records) {
                        result.push({ ...record, _recordType: 'product' });
                        for (const variant of record.variants || []) {
                            result.push({ ...transformVariant(variant, record.sku, mapping?.product, defaultLanguage, languages), _recordType: 'variant', _parentSku: record.sku, _pimcoreOriginal: variant });
                        }
                    }
                    return result;
                `,
            },
        },
    };
}

export default {
    extractLocalizedValue,
    buildTranslations,
    generateSlug,
    transformProduct,
    transformVariant,
    transformCategory,
    transformAsset,
    createPimcoreTransformOperators,
};
