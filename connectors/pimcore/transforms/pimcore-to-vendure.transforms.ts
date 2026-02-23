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
import { getNestedValue } from '../../../shared/utils/object-path';
import { priceToCents } from '../utils/math.utils';

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a PimcoreLocalizedField (object with string language codes as keys)
 */
export function isLocalizedField(value: unknown): value is PimcoreLocalizedField {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value !== 'object') {
        return false;
    }
    // Check that it's a plain object (not an array)
    if (Array.isArray(value)) {
        return false;
    }
    // Check that all values are either strings or null (as per PimcoreLocalizedField interface)
    for (const val of Object.values(value)) {
        if (val !== null && typeof val !== 'string') {
            return false;
        }
    }
    return true;
}

/**
 * Type guard to check if a value is either a string or a PimcoreLocalizedField
 */
export function isStringOrLocalized(value: unknown): value is string | PimcoreLocalizedField {
    if (typeof value === 'string') {
        return true;
    }
    return isLocalizedField(value);
}

/**
 * Safely coerce a value to string | PimcoreLocalizedField, returning undefined if invalid
 */
function toStringOrLocalized(value: unknown): string | PimcoreLocalizedField | undefined {
    if (isStringOrLocalized(value)) {
        return value;
    }
    return undefined;
}

/**
 * Type guard to check if a value is a parent reference object with an id property
 */
function isParentReference(value: unknown): value is { id: string | number } {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const obj = value as Record<string, unknown>;
    return typeof obj.id === 'string' || typeof obj.id === 'number';
}

/**
 * Type guard to check if a value is an array of asset references with id properties
 */
function isAssetReferenceArray(value: unknown): value is Array<{ id: string | number }> {
    if (!Array.isArray(value)) {
        return false;
    }
    return value.every(item => {
        if (item === null || item === undefined || typeof item !== 'object') {
            return false;
        }
        const obj = item as Record<string, unknown>;
        return typeof obj.id === 'string' || typeof obj.id === 'number';
    });
}

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

    // field is now narrowed to PimcoreLocalizedField
    const langValue = field[language];
    if (langValue) return langValue;

    const fallbackValue = field[fallbackLanguage];
    if (fallbackValue) return fallbackValue;

    // Return first non-null value, or empty string
    const values = Object.values(field).filter((v): v is string => v != null);
    return values[0] ?? '';
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
    const mapping_ = { ...DEFAULT_PRODUCT_MAPPING, ...mapping };

    const sku = String(
        getNestedValue(pimcoreProduct, mapping_.skuField) ??
        getNestedValue(pimcoreProduct, 'itemNumber') ??
        pimcoreProduct.key ??
        pimcoreProduct.id
    );

    const rawNameField = getNestedValue(pimcoreProduct, mapping_.nameField);
    const nameField = toStringOrLocalized(rawNameField);
    const name = extractLocalizedValue(nameField, defaultLanguage);

    const rawSlugField = getNestedValue(pimcoreProduct, mapping_.slugField) ?? getNestedValue(pimcoreProduct, 'urlKey');
    const slugField = toStringOrLocalized(rawSlugField);
    let slug = extractLocalizedValue(slugField, defaultLanguage);
    if (!slug) slug = generateSlug(name || sku);

    const rawDescField = getNestedValue(pimcoreProduct, mapping_.descriptionField);
    const descField = toStringOrLocalized(rawDescField);
    const description = extractLocalizedValue(descField, defaultLanguage);

    const enabledField = getNestedValue(pimcoreProduct, mapping_.enabledField);
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
            { name: nameField, slug: slugField, description: descField },
            ['name', 'slug', 'description'],
            languages,
        );
    }

    const rawAssets = getNestedValue(pimcoreProduct, mapping_.assetsField);
    if (isAssetReferenceArray(rawAssets) && rawAssets.length > 0) {
        result.assetIds = rawAssets.map(a => `pimcore:asset:${a.id}`);
        result.featuredAssetId = result.assetIds[0];
    }

    if (mapping?.customFields) {
        result.customFields = {};
        for (const [vendureField, pimcoreField] of Object.entries(mapping.customFields)) {
            const value = getNestedValue(pimcoreProduct, pimcoreField);
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
    const mapping_ = { ...DEFAULT_PRODUCT_MAPPING, ...mapping };

    const sku = String(
        getNestedValue(pimcoreVariant, mapping_.skuField) ??
        getNestedValue(pimcoreVariant, 'itemNumber') ??
        `${parentSku}-${pimcoreVariant.key ?? pimcoreVariant.id}`
    );

    const rawNameField = getNestedValue(pimcoreVariant, mapping_.nameField);
    const nameField = toStringOrLocalized(rawNameField);
    const name = extractLocalizedValue(nameField, defaultLanguage) || sku;

    const rawPrice = getNestedValue(pimcoreVariant, 'price');
    const price = priceToCents(typeof rawPrice === 'number' || typeof rawPrice === 'string' ? rawPrice : undefined);
    const rawStockQuantity = getNestedValue(pimcoreVariant, 'stockQuantity');
    const stockQuantity = typeof rawStockQuantity === 'number' ? rawStockQuantity : undefined;

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
        result.translations = buildTranslations({ name: nameField }, ['name'], languages);
    }

    return result;
}

export function transformCategory(
    pimcoreCategory: PimcoreCategory,
    mapping?: PimcoreMappingConfig['category'],
    defaultLanguage = 'en',
    languages: string[] = ['en'],
): VendureCategoryInput {
    const mapping_ = { ...DEFAULT_CATEGORY_MAPPING, ...mapping };

    const rawNameField = getNestedValue(pimcoreCategory, mapping_.nameField);
    const nameField = toStringOrLocalized(rawNameField);
    const name = extractLocalizedValue(nameField, defaultLanguage) ||
        pimcoreCategory.key || String(pimcoreCategory.id);

    const rawSlugField = getNestedValue(pimcoreCategory, mapping_.slugField);
    const slugField = toStringOrLocalized(rawSlugField);
    let slug = extractLocalizedValue(slugField, defaultLanguage);
    if (!slug) slug = generateSlug(name);

    const rawDescField = getNestedValue(pimcoreCategory, mapping_.descriptionField);
    const descField = toStringOrLocalized(rawDescField);
    const description = extractLocalizedValue(descField, defaultLanguage);

    const rawParent = getNestedValue(pimcoreCategory, mapping_.parentField);
    const parent = isParentReference(rawParent) ? rawParent : undefined;
    const parentExternalId = parent?.id ? `pimcore:category:${parent.id}` : undefined;
    const rawPosition = getNestedValue(pimcoreCategory, mapping_.positionField);
    const position = typeof rawPosition === 'number' ? rawPosition : undefined;

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
            { name: nameField, slug: slugField, description: descField },
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
    const mapping_ = { ...DEFAULT_ASSET_MAPPING, ...mapping };

    const rawUrl = getNestedValue(pimcoreAsset, mapping_.urlField);
    let url = typeof rawUrl === 'string' ? rawUrl : undefined;
    if (url && baseUrl && !url.startsWith('http')) {
        url = `${baseUrl.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    const rawAlt = getNestedValue(pimcoreAsset, mapping_.altField);
    const alt = typeof rawAlt === 'string' ? rawAlt : undefined;
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
