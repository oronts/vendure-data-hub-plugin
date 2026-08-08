import type {
    PimcoreAssetMappingConfig,
    PimcoreAssetQueryConfig,
    PimcoreMappingConfig,
    PimcoreObjectQueryConfig,
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
    queryConfig: PimcoreObjectQueryConfig = {},
): string {
    const contract = resolvePimcoreQueryContract('product', queryConfig);
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
            contract.fragmentType,
        )
        : '';

    return `
        query GetProducts($first: Int, $after: Int, $filter: String, $sortBy: [String], $sortOrder: [String], $defaultLanguage: String, $published: Boolean) {
            ${renderListingField(contract)}(first: $first, after: $after, filter: $filter, sortBy: $sortBy, sortOrder: $sortOrder, defaultLanguage: $defaultLanguage, published: $published) {
                totalCount
                edges {
                    node {
                        id key fullpath published modificationDate creationDate
                        ... on ${contract.fragmentType} {
                            ${classFields.join(' ')}
                            ${variantsSelection}
                        }
                    }
                }
            }
        }
    `;
}

export function createPimcoreCategoryQuery(
    mapping: PimcoreMappingConfig['category'] = {},
    queryConfig: PimcoreObjectQueryConfig = {},
): string {
    const contract = resolvePimcoreQueryContract('category', queryConfig);
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
            ${renderListingField(contract)}(first: $first, after: $after, filter: $filter, sortBy: $sortBy, sortOrder: $sortOrder, defaultLanguage: $defaultLanguage, published: $published) {
                totalCount
                edges {
                    node {
                        id key fullpath published index
                        ... on ${contract.fragmentType} {
                            ${classFields.join(' ')}
                            ${parentField} {
                                ... on ${contract.fragmentType} { id key fullpath ${slugField} }
                            }
                        }
                    }
                }
            }
        }
    `;
}

export function createPimcoreAssetQuery(
    mapping: PimcoreAssetMappingConfig = {},
    queryConfig: PimcoreAssetQueryConfig = {},
): string {
    const contract = resolvePimcoreQueryContract('asset', queryConfig);
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
            ${renderListingField(contract)}(first: $first, after: $after, filter: $filter, sortBy: $sortBy, sortOrder: $sortOrder) {
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
    fragmentType: string,
): string {
    const field = validateGraphQLFieldName(rawField, 'mapping.product.variantsField');
    const relation = field === 'variants'
        ? 'variants: children(objectTypes: ["variant"])'
        : field === 'children'
            ? 'children(objectTypes: ["variant"])'
            : field;
    return `${relation} {
        ... on ${fragmentType} {
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

export interface PimcoreQueryContract {
    readonly listingField: string;
    readonly responseField: string;
    readonly fragmentType: string;
}

export function resolvePimcoreQueryContract(
    entityType: 'product' | 'category' | 'asset',
    config: PimcoreObjectQueryConfig | PimcoreAssetQueryConfig = {},
): PimcoreQueryContract {
    if (entityType === 'asset') {
        const listingField = validateGraphQLFieldName(
            config.listingField ?? 'getAssetListing',
            'queries.asset.listingField',
        );
        return {
            listingField,
            responseField: validateGraphQLFieldName(
                config.responseField ?? listingField,
                'queries.asset.responseField',
            ),
            fragmentType: '',
        };
    }

    const objectConfig = config as PimcoreObjectQueryConfig;
    const path = `queries.${entityType}`;
    const defaultClassName = entityType === 'product' ? 'Product' : 'Category';
    const className = validateGraphQLFieldName(
        objectConfig.className ?? defaultClassName,
        `${path}.className`,
    );
    const listingField = validateGraphQLFieldName(
        objectConfig.listingField ?? `get${className}Listing`,
        `${path}.listingField`,
    );
    return {
        listingField,
        responseField: validateGraphQLFieldName(
            objectConfig.responseField ?? listingField,
            `${path}.responseField`,
        ),
        fragmentType: validateGraphQLFieldName(
            objectConfig.fragmentType ?? `object_${className}`,
            `${path}.fragmentType`,
        ),
    };
}

function renderListingField(contract: PimcoreQueryContract): string {
    return contract.responseField === contract.listingField
        ? contract.listingField
        : `${contract.responseField}: ${contract.listingField}`;
}

function uniqueFields(fields: string[]): string[] {
    return [...new Set(fields)];
}
