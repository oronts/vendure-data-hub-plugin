import type {
    PimcoreAssetMappingConfig,
    PimcoreMappingConfig,
    PimcoreProductMappingConfig,
} from '../types';

const GRAPHQL_FIELD_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;
const PRODUCT_BASE_FIELDS = new Set([
    'id',
    'key',
    'fullpath',
    'published',
    'creationDate',
    'modificationDate',
]);
const CATEGORY_BASE_FIELDS = new Set([
    'id',
    'key',
    'fullpath',
    'published',
    'index',
]);

export function createPimcoreProductQuery(
    mapping: PimcoreProductMappingConfig = {},
    includeVariants = true,
): string {
    const skuField = validateGraphQLFieldName(mapping.skuField ?? 'sku', 'mapping.product.skuField');
    const nameField = validateGraphQLFieldName(mapping.nameField ?? 'name', 'mapping.product.nameField');
    const slugField = validateGraphQLFieldName(mapping.slugField ?? 'slug', 'mapping.product.slugField');
    const descriptionField = validateGraphQLFieldName(
        mapping.descriptionField ?? 'description',
        'mapping.product.descriptionField',
    );
    const enabledField = validateGraphQLFieldName(
        mapping.enabledField ?? 'published',
        'mapping.product.enabledField',
    );
    const priceField = validateGraphQLFieldName(
        mapping.priceField ?? 'price',
        'mapping.product.priceField',
    );
    const stockQuantityField = validateGraphQLFieldName(
        mapping.stockQuantityField ?? 'stockQuantity',
        'mapping.product.stockQuantityField',
    );
    const classFields = uniqueFields([
        skuField,
        nameField,
        slugField,
        descriptionField,
        enabledField,
        priceField,
    ]).filter(field => !PRODUCT_BASE_FIELDS.has(field));
    const variantsSelection = includeVariants
        ? createVariantsSelection(
            mapping.variantsField ?? 'variants',
            skuField,
            nameField,
            enabledField,
            priceField,
            stockQuantityField,
        )
        : '';

    return `
        query GetProducts($first: Int, $after: Int, $filter: String, $sortBy: [String], $sortOrder: [String], $defaultLanguage: String, $published: Boolean) {
            getProductListing(first: $first, after: $after, filter: $filter, sortBy: $sortBy, sortOrder: $sortOrder, defaultLanguage: $defaultLanguage, published: $published) {
                totalCount
                edges {
                    node {
                        id key fullpath published modificationDate creationDate
                        ... on object_Product {
                            ${classFields.join(' ')}
                            ${variantsSelection}
                        }
                    }
                }
            }
        }
    `;
}

export function createPimcoreCategoryQuery(mapping: PimcoreMappingConfig['category'] = {}): string {
    const nameField = validateGraphQLFieldName(mapping.nameField ?? 'name', 'mapping.category.nameField');
    const slugField = validateGraphQLFieldName(mapping.slugField ?? 'slug', 'mapping.category.slugField');
    const descriptionField = validateGraphQLFieldName(
        mapping.descriptionField ?? 'description',
        'mapping.category.descriptionField',
    );
    const positionField = validateGraphQLFieldName(
        mapping.positionField ?? 'index',
        'mapping.category.positionField',
    );
    const parentField = validateGraphQLFieldName(mapping.parentField ?? 'parent', 'mapping.category.parentField');
    const classFields = uniqueFields([
        nameField,
        slugField,
        descriptionField,
        positionField,
    ]).filter(field => !CATEGORY_BASE_FIELDS.has(field));

    return `
        query GetCategories($first: Int, $after: Int, $filter: String, $sortBy: [String], $sortOrder: [String], $defaultLanguage: String, $published: Boolean) {
            getCategoryListing(first: $first, after: $after, filter: $filter, sortBy: $sortBy, sortOrder: $sortOrder, defaultLanguage: $defaultLanguage, published: $published) {
                totalCount
                edges {
                    node {
                        id key fullpath published index
                        ... on object_Category {
                            ${classFields.join(' ')}
                            ${parentField} {
                                ... on object_Category { id key fullpath ${slugField} }
                            }
                        }
                    }
                }
            }
        }
    `;
}

export function createPimcoreAssetQuery(mapping: PimcoreAssetMappingConfig = {}): string {
    const urlField = validateGraphQLFieldName(mapping.urlField ?? 'fullpath', 'mapping.asset.urlField');
    const filenameField = validateGraphQLFieldName(
        mapping.filenameField ?? 'filename',
        'mapping.asset.filenameField',
    );
    const fields = uniqueFields([
        'id',
        filenameField,
        urlField,
        'mimetype',
        'filesize',
    ]);

    return `
        query GetAssets($first: Int, $after: Int, $filter: String, $sortBy: [String], $sortOrder: [String]) {
            getAssetListing(first: $first, after: $after, filter: $filter, sortBy: $sortBy, sortOrder: $sortOrder) {
                totalCount
                edges {
                    node {
                        ${fields.join(' ')}
                        metadata { name language type data }
                    }
                }
            }
        }
    `;
}

export function validateGraphQLFieldName(field: string, configPath: string): string {
    if (!GRAPHQL_FIELD_NAME.test(field)) {
        throw new Error(`${configPath} must be a GraphQL field name`);
    }
    return field;
}

function createVariantsSelection(
    rawField: string,
    skuField: string,
    nameField: string,
    enabledField: string,
    priceField: string,
    stockQuantityField: string,
): string {
    const field = validateGraphQLFieldName(rawField, 'mapping.product.variantsField');
    const relation = field === 'variants'
        ? 'variants: children(objectTypes: ["variant"])'
        : field === 'children'
            ? 'children(objectTypes: ["variant"])'
            : field;
    return `${relation} {
        ... on object_Product {
            ${uniqueFields([
                'id',
                'key',
                'fullpath',
                'published',
                skuField,
                nameField,
                enabledField,
                priceField,
                stockQuantityField,
            ]).join(' ')}
        }
    }`;
}

function uniqueFields(fields: string[]): string[] {
    return [...new Set(fields)];
}
