import { ConnectorDefinition } from '../types';
import { defineConnector } from '../registry';
import { PimcoreConnectorConfig } from './types';
import { PipelineDefinition } from '../../src/types';
import { pimcoreGraphQLExtractor } from './extractors/pimcore-graphql.extractor';
import {
    createProductSyncPipeline,
    createCategorySyncPipeline,
    createAssetSyncPipeline,
    createFacetSyncPipeline,
} from './pipelines';
import { validateEndpointUrl } from './utils/security.utils';
import { DEFAULT_CHANNEL_CODE } from '../../shared/constants';

export * from './types';
export * from './extractors';
export * from './transforms';
export * from './pipelines';

/** Default secret code for the Pimcore DataHub API key */
export const PIMCORE_API_KEY_SECRET = 'pimcore-api-key';
/** Default secret code for the Pimcore webhook authentication key */
export const PIMCORE_WEBHOOK_KEY_SECRET = 'pimcore-webhook-key';
/** Webhook signature algorithm used by Pimcore webhooks */
export const PIMCORE_WEBHOOK_SIGNATURE = 'hmac-sha256';

export const pimcoreConnectorDefinition: ConnectorDefinition<PimcoreConnectorConfig> = {
    code: 'pimcore',
    name: 'Pimcore PIM/DAM',
    description: 'Sync products, categories, assets, and facets from Pimcore DataHub',
    version: '1.0.0',
    author: 'Oronts',
    docsUrl: 'https://oronts.com/data-hub/connectors/pimcore',
    icon: 'pimcore',

    extractors: [pimcoreGraphQLExtractor],
    loaders: [],

    importTemplates: [
        {
            id: 'pimcore-product-sync',
            name: 'Pimcore Product Sync',
            description: 'Sync products from Pimcore PIM via GraphQL DataHub API. Maps Pimcore product objects to Vendure products with variants, pricing, and assets.',
            category: 'products',
            icon: 'database',
            requiredFields: ['name', 'sku', 'price'],
            optionalFields: ['description', 'slug', 'images', 'categories', 'variants', 'enabled'],
            featured: true,
            tags: ['pimcore', 'pim', 'sync', 'api'],
            formats: ['API'],
            definition: {
                sourceType: 'API',
                targetEntity: 'Product',
                existingRecords: 'UPDATE',
                lookupFields: ['sku'],
                fieldMappings: [
                    { sourceField: 'name', targetField: 'name' },
                    { sourceField: 'sku', targetField: 'sku' },
                    { sourceField: 'price', targetField: 'price' },
                    { sourceField: 'description', targetField: 'description' },
                    { sourceField: 'slug', targetField: 'slug' },
                ],
            },
        },
        {
            id: 'pimcore-category-sync',
            name: 'Pimcore Category Sync',
            description: 'Sync categories from Pimcore to Vendure collections. Preserves parent-child hierarchy and supports multi-language.',
            category: 'catalog',
            icon: 'folder-tree',
            requiredFields: ['name'],
            optionalFields: ['slug', 'description', 'parent', 'position'],
            tags: ['pimcore', 'pim', 'sync', 'api'],
            formats: ['API'],
            definition: {
                sourceType: 'API',
                targetEntity: 'Collection',
                existingRecords: 'UPDATE',
                lookupFields: ['name'],
                fieldMappings: [
                    { sourceField: 'name', targetField: 'name' },
                    { sourceField: 'slug', targetField: 'slug' },
                    { sourceField: 'description', targetField: 'description' },
                ],
            },
        },
        {
            id: 'pimcore-asset-sync',
            name: 'Pimcore Asset Sync',
            description: 'Sync digital assets from Pimcore DAM to Vendure. Imports images, documents, and media files with metadata.',
            category: 'catalog',
            icon: 'image',
            requiredFields: ['filename', 'fullPath'],
            optionalFields: ['mimetype', 'filesize', 'metadata'],
            tags: ['pimcore', 'dam', 'assets', 'media'],
            formats: ['API'],
            definition: {
                sourceType: 'API',
                targetEntity: 'Asset',
                existingRecords: 'UPDATE',
                lookupFields: ['filename'],
                fieldMappings: [
                    { sourceField: 'filename', targetField: 'filename' },
                    { sourceField: 'fullPath', targetField: 'source' },
                ],
            },
        },
        {
            id: 'pimcore-facet-sync',
            name: 'Pimcore Facet/Attribute Sync',
            description: 'Sync product attributes and classification data from Pimcore to Vendure facets. Handles attribute groups and select options.',
            category: 'catalog',
            icon: 'tag',
            requiredFields: ['key'],
            optionalFields: ['title', 'options'],
            tags: ['pimcore', 'pim', 'attributes', 'facets'],
            formats: ['API'],
            definition: {
                sourceType: 'API',
                targetEntity: 'Facet',
                existingRecords: 'UPDATE',
                lookupFields: ['key'],
                fieldMappings: [
                    { sourceField: 'key', targetField: 'code' },
                    { sourceField: 'title', targetField: 'name' },
                ],
            },
        },
    ],

    exportTemplates: [
        {
            id: 'pimcore-product-export',
            name: 'Product Export for Pimcore',
            description: 'Export Vendure product catalog as JSON for import into Pimcore PIM. Includes variants, pricing, and custom fields.',
            icon: 'upload',
            format: 'JSON',
            tags: ['pimcore', 'pim', 'integration'],
            definition: {
                sourceEntity: 'Product',
                formatOptions: { pretty: true, rootElement: 'products' },
            },
        },
    ],

    defaultConfig: {
        enabled: true,
        vendureChannel: DEFAULT_CHANNEL_CODE,
        defaultLanguage: 'en',
        languages: ['en'],
        sync: {
            deltaSync: true,
            batchSize: 100,
            maxPages: 100,
            includeUnpublished: false,
            includeVariants: true,
        },
        pipelines: {
            productSync: { enabled: true },
            categorySync: { enabled: true },
            assetSync: { enabled: true },
            facetSync: { enabled: true },
        },
    },

    validateConfig(config: PimcoreConnectorConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!config.connection?.endpoint) {
            errors.push('Pimcore endpoint is required');
        }

        if (!config.connection?.apiKey && !config.connection?.apiKeySecretCode) {
            errors.push('API key or apiKeySecretCode is required');
        }

        if (config.connection?.endpoint) {
            const isProd = process.env.NODE_ENV === 'production';
            const urlValidation = validateEndpointUrl(config.connection.endpoint, {
                requireHttps: isProd,
                allowLocalhost: !isProd,
                allowPrivateIp: !isProd,
            });
            if (!urlValidation.valid) {
                errors.push(...urlValidation.errors);
            }
        }

        return { valid: errors.length === 0, errors };
    },

    createPipelines(config: PimcoreConnectorConfig): PipelineDefinition[] {
        const pipelines: PipelineDefinition[] = [];

        if (config.pipelines?.productSync?.enabled !== false) {
            pipelines.push(createProductSyncPipeline(config));
        }
        if (config.pipelines?.categorySync?.enabled !== false) {
            pipelines.push(createCategorySyncPipeline(config));
        }
        if (config.pipelines?.assetSync?.enabled !== false) {
            pipelines.push(createAssetSyncPipeline(config));
        }
        if (config.pipelines?.facetSync?.enabled !== false) {
            pipelines.push(createFacetSyncPipeline(config));
        }

        return pipelines;
    },
};

export const PimcoreConnector = defineConnector(pimcoreConnectorDefinition);
