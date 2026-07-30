import type { EntityField } from '../types';

export const ASSET_AND_CUSTOM_FIELD_SCHEMA_FIELDS = [
    {
        key: 'assetUrls',
        label: 'Asset URLs',
        type: 'array',
        description: 'URLs of images to attach',
    },
    {
        key: 'featuredAssetUrl',
        label: 'Featured Asset URL',
        type: 'string',
        description: 'URL of the featured/main image',
    },
    {
        key: 'customFields',
        label: 'Custom Fields',
        type: 'object',
        description: 'Custom field values',
    },
] as const satisfies readonly EntityField[];
