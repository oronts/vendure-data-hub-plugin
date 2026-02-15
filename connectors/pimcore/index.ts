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

export * from './types';
export * from './extractors';
export * from './transforms';
export * from './pipelines';

const DEFAULT_CHANNEL = '__default_channel__';

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

    defaultConfig: {
        enabled: true,
        vendureChannel: DEFAULT_CHANNEL,
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

export default PimcoreConnector;
