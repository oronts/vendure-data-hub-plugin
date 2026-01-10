import { ALL_ADAPTERS } from './constants';

/**
 * Get adapter info by adapter code
 */
export function getAdapterInfo(adapterCode?: string) {
    return ALL_ADAPTERS.find(a => a.type === adapterCode);
}

/**
 * Check if adapter is a file source type
 */
export function isFileSourceAdapter(adapterCode?: string): boolean {
    return ['csv', 'json', 'excel', 'xml'].includes(adapterCode || '');
}

/**
 * Check if adapter is a Vendure loader type
 */
export function isVendureLoaderAdapter(adapterCode?: string): boolean {
    return ['productUpsert', 'variantUpsert', 'customerUpsert'].includes(adapterCode || '');
}

/**
 * Get accepted file formats for a file source adapter
 */
export function getAcceptedFormats(adapterCode?: string): string[] {
    switch (adapterCode) {
        case 'csv':
            return ['csv'];
        case 'json':
            return ['json'];
        case 'excel':
            return ['xlsx', 'xls'];
        case 'xml':
            return ['xml'];
        default:
            return ['csv', 'json', 'xlsx'];
    }
}

/**
 * Get target entity schema name for a Vendure loader
 */
export function getTargetSchemaEntity(adapterCode?: string): string | null {
    switch (adapterCode) {
        case 'productUpsert':
            return 'Product';
        case 'variantUpsert':
            return 'ProductVariant';
        case 'customerUpsert':
            return 'Customer';
        default:
            return null;
    }
}
