import { ConnectorDefinition } from '../types';
import { defineConnector } from '../registry';
import { PimcoreConnectorConfig } from './types';
import type { PipelineDefinition } from '../../src/types';
import type { CodeFirstPipeline } from '../../shared/types';
import { pimcoreGraphQLExtractor } from './extractors/pimcore-graphql.extractor';
import {
    createProductSyncPipeline,
    createCategorySyncPipeline,
    createAssetSyncPipeline,
} from './pipelines';
import { DEFAULT_CHANNEL_CODE } from '../../shared/constants';
import { PIMCORE_EXTRACTOR_LIMITS, PIMCORE_PIPELINE_METADATA } from './constants';
import {
    resolvePimcoreQueryContract,
    validateGraphQLFieldName,
} from './extractors/query-builder';
import { buildSafePathFilter } from './utils/security.utils';

export * from './types';
export * from './extractors';
export * from './transforms';
export * from './pipelines';
export * from './constants';

export const pimcoreConnectorDefinition: ConnectorDefinition<PimcoreConnectorConfig> = {
    code: 'pimcore',
    name: 'Pimcore PIM/DAM',
    description: 'Sync products, categories, and assets from Pimcore DataHub',
    version: '1.0.0',
    author: 'Oronts',
    docsUrl: 'https://github.com/oronts/vendure-data-hub-plugin/blob/main/connectors/pimcore/README.md',
    icon: 'pimcore',

    extractors: [pimcoreGraphQLExtractor],
    loaders: [],

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
        vendureChannel: DEFAULT_CHANNEL_CODE,
        defaultLanguage: 'en',
        sync: {
            deltaSync: true,
            batchSize: PIMCORE_EXTRACTOR_LIMITS.DEFAULT_PAGE_SIZE,
            maxPages: PIMCORE_EXTRACTOR_LIMITS.DEFAULT_MAX_PAGES,
            includeUnpublished: false,
            includeVariants: true,
        },
        pipelines: {
            productSync: { enabled: true },
            categorySync: { enabled: true },
            assetSync: { enabled: true },
        },
    },

    validateConfig(config: PimcoreConnectorConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        const untypedConfig = config as PimcoreConnectorConfig & {
            instanceId?: unknown;
            enabled?: unknown;
            tags?: unknown;
        };
        validateKnownFields(errors, 'config', config, [
            'connectionCode',
            'timeoutMs',
            'sync',
            'mapping',
            'queries',
            'pipelines',
            'vendureChannel',
            'defaultLanguage',
            'instanceId',
            'enabled',
            'tags',
        ]);
        for (const field of ['instanceId', 'enabled', 'tags'] as const) {
            if (untypedConfig[field] !== undefined) {
                errors.push(`Pimcore connector field "${field}" is not supported`);
            }
        }

        validateKnownFields(errors, 'sync', config.sync, [
            'deltaSync',
            'batchSize',
            'maxPages',
            'includeUnpublished',
            'includeVariants',
            'pathFilter',
        ]);
        validateKnownFields(errors, 'mapping', config.mapping, ['product', 'category', 'asset']);
        validateKnownFields(errors, 'mapping.product', config.mapping?.product, [
            'skuField',
            'nameField',
            'slugField',
            'descriptionField',
            'variantsField',
            'priceField',
            'stockQuantityField',
            'enabledField',
        ]);
        validateKnownFields(errors, 'mapping.category', config.mapping?.category, [
            'nameField',
            'slugField',
            'descriptionField',
            'parentField',
            'positionField',
        ]);
        validateKnownFields(errors, 'mapping.asset', config.mapping?.asset, ['urlField', 'filenameField']);
        validateKnownFields(errors, 'queries', config.queries, ['product', 'category', 'asset']);
        validateKnownFields(errors, 'queries.product', config.queries?.product, [
            'query',
            'className',
            'listingField',
            'responseField',
            'fragmentType',
        ]);
        validateKnownFields(errors, 'queries.category', config.queries?.category, [
            'query',
            'className',
            'listingField',
            'responseField',
            'fragmentType',
        ]);
        validateKnownFields(errors, 'queries.asset', config.queries?.asset, [
            'query',
            'listingField',
            'responseField',
        ]);
        validateKnownFields(errors, 'pipelines', config.pipelines, ['productSync', 'categorySync', 'assetSync']);
        validateKnownFields(errors, 'pipelines.productSync', config.pipelines?.productSync, [
            'enabled',
            'name',
            'schedule',
            'syncVariants',
        ]);
        validateKnownFields(errors, 'pipelines.categorySync', config.pipelines?.categorySync, [
            'enabled',
            'name',
            'schedule',
            'rootPath',
        ]);
        validateKnownFields(errors, 'pipelines.assetSync', config.pipelines?.assetSync, [
            'enabled',
            'name',
            'schedule',
            'folderPath',
            'mimeTypes',
        ]);

        if (
            typeof config.connectionCode !== 'string'
            || config.connectionCode.trim() === ''
            || config.connectionCode !== config.connectionCode.trim()
        ) {
            errors.push('Pimcore connectionCode must be a non-empty string without surrounding whitespace');
        }

        validateOptionalInteger(
            errors,
            'timeoutMs',
            config.timeoutMs,
            1,
            PIMCORE_EXTRACTOR_LIMITS.MAX_TIMEOUT_MS,
        );
        validateOptionalInteger(
            errors,
            'sync.batchSize',
            config.sync?.batchSize,
            1,
            PIMCORE_EXTRACTOR_LIMITS.MAX_PAGE_SIZE,
        );
        validateOptionalInteger(
            errors,
            'sync.maxPages',
            config.sync?.maxPages,
            1,
            PIMCORE_EXTRACTOR_LIMITS.MAX_PAGES,
        );

        if (config.defaultLanguage !== undefined && (
            typeof config.defaultLanguage !== 'string' || !config.defaultLanguage.trim()
        )) {
            errors.push('defaultLanguage must not be empty');
        }

        validateOptionalNonEmptyString(errors, 'vendureChannel', config.vendureChannel);
        validateOptionalNonEmptyString(errors, 'sync.pathFilter', config.sync?.pathFilter);
        validateOptionalNonEmptyString(errors, 'pipelines.productSync.name', config.pipelines?.productSync?.name);
        validateOptionalNonEmptyString(errors, 'pipelines.productSync.schedule', config.pipelines?.productSync?.schedule);
        validateOptionalNonEmptyString(errors, 'pipelines.categorySync.name', config.pipelines?.categorySync?.name);
        validateOptionalNonEmptyString(errors, 'pipelines.categorySync.schedule', config.pipelines?.categorySync?.schedule);
        validateOptionalNonEmptyString(errors, 'pipelines.categorySync.rootPath', config.pipelines?.categorySync?.rootPath);
        validateOptionalNonEmptyString(errors, 'pipelines.assetSync.name', config.pipelines?.assetSync?.name);
        validateOptionalNonEmptyString(errors, 'pipelines.assetSync.schedule', config.pipelines?.assetSync?.schedule);
        validateOptionalNonEmptyString(errors, 'pipelines.assetSync.folderPath', config.pipelines?.assetSync?.folderPath);

        validateMappingFieldNames(errors, config.mapping);
        validateQueryConfigs(errors, config);
        validateMimeTypes(errors, config.pipelines?.assetSync?.mimeTypes);
        validatePathFilter(errors, 'sync.pathFilter', config.sync?.pathFilter);
        validatePathFilter(errors, 'pipelines.categorySync.rootPath', config.pipelines?.categorySync?.rootPath);
        validatePathFilter(errors, 'pipelines.assetSync.folderPath', config.pipelines?.assetSync?.folderPath);

        validateOptionalBoolean(errors, 'sync.deltaSync', config.sync?.deltaSync);
        validateOptionalBoolean(errors, 'sync.includeUnpublished', config.sync?.includeUnpublished);
        validateOptionalBoolean(errors, 'sync.includeVariants', config.sync?.includeVariants);
        validateOptionalBoolean(errors, 'pipelines.productSync.enabled', config.pipelines?.productSync?.enabled);
        validateOptionalBoolean(errors, 'pipelines.productSync.syncVariants', config.pipelines?.productSync?.syncVariants);
        validateOptionalBoolean(errors, 'pipelines.categorySync.enabled', config.pipelines?.categorySync?.enabled);
        validateOptionalBoolean(errors, 'pipelines.assetSync.enabled', config.pipelines?.assetSync?.enabled);

        return { valid: errors.length === 0, errors };
    },

    createPipelines(config: PimcoreConnectorConfig): CodeFirstPipeline[] {
        const pipelines: CodeFirstPipeline[] = [];

        if (config.pipelines?.productSync?.enabled !== false) {
            pipelines.push(createPipelineRegistration(
                PIMCORE_PIPELINE_METADATA.PRODUCT_SYNC,
                createProductSyncPipeline(config),
            ));
        }
        if (config.pipelines?.categorySync?.enabled !== false) {
            pipelines.push(createPipelineRegistration(
                PIMCORE_PIPELINE_METADATA.CATEGORY_SYNC,
                createCategorySyncPipeline(config),
            ));
        }
        if (config.pipelines?.assetSync?.enabled !== false) {
            pipelines.push(createPipelineRegistration(
                PIMCORE_PIPELINE_METADATA.ASSET_SYNC,
                createAssetSyncPipeline(config),
            ));
        }
        return pipelines;
    },
};

export const PimcoreConnector = defineConnector(pimcoreConnectorDefinition);

function createPipelineRegistration(
    metadata: { readonly code: string; readonly name: string },
    definition: PipelineDefinition,
): CodeFirstPipeline {
    return {
        code: metadata.code,
        name: definition.name ?? metadata.name,
        description: definition.description,
        enabled: true,
        definition,
    };
}

function validateOptionalInteger(
    errors: string[],
    field: string,
    value: number | undefined,
    min: number,
    max: number,
): void {
    if (value === undefined) return;
    if (!Number.isInteger(value) || value < min || value > max) {
        errors.push(`${field} must be an integer between ${min} and ${max}`);
    }
}

function validateOptionalBoolean(errors: string[], field: string, value: boolean | undefined): void {
    if (value !== undefined && typeof value !== 'boolean') {
        errors.push(`${field} must be a boolean`);
    }
}

function validateOptionalNonEmptyString(errors: string[], field: string, value: string | undefined): void {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
        errors.push(`${field} must be a non-empty string`);
    }
}

function validateMappingFieldNames(errors: string[], mapping: PimcoreConnectorConfig['mapping']): void {
    const groups = [
        ['mapping.product', mapping?.product],
        ['mapping.category', mapping?.category],
        ['mapping.asset', mapping?.asset],
    ] as const;

    for (const [path, fields] of groups) {
        if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
        for (const [field, value] of Object.entries(fields)) {
            if (typeof value !== 'string') {
                errors.push(`${path}.${field} must be a GraphQL field name`);
                continue;
            }
            try {
                validateGraphQLFieldName(value, `${path}.${field}`);
            } catch (error) {
                errors.push(error instanceof Error ? error.message : `${path}.${field} must be a GraphQL field name`);
            }
        }
    }
}

function validateQueryConfigs(
    errors: string[],
    config: PimcoreConnectorConfig,
): void {
    for (const entityType of ['product', 'category', 'asset'] as const) {
        const queryConfig = config.queries?.[entityType];
        if (!queryConfig) continue;

        if (queryConfig.query !== undefined && (
            typeof queryConfig.query !== 'string' || !queryConfig.query.trim()
        )) {
            errors.push(`queries.${entityType}.query must be a non-empty string`);
        }
        try {
            resolvePimcoreQueryContract(entityType, queryConfig);
        } catch (error) {
            errors.push(error instanceof Error
                ? error.message
                : `queries.${entityType} contains an invalid GraphQL name`);
        }
    }
}

function validatePathFilter(
    errors: string[],
    field: string,
    value: string | undefined,
): void {
    if (value === undefined || typeof value !== 'string' || !value.trim()) return;
    try {
        buildSafePathFilter(value);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'invalid Pimcore path filter';
        errors.push(field + ': ' + message);
    }
}

function validateMimeTypes(errors: string[], mimeTypes: string[] | undefined): void {
    if (mimeTypes === undefined) return;
    if (!Array.isArray(mimeTypes) || mimeTypes.length === 0) {
        errors.push('pipelines.assetSync.mimeTypes must be a non-empty array');
        return;
    }
    if (mimeTypes.some(value => typeof value !== 'string' || !/^[a-z]+\/[a-z0-9*+.-]+$/i.test(value))) {
        errors.push('pipelines.assetSync.mimeTypes must contain valid MIME type strings');
    }
}

function validateKnownFields(
    errors: string[],
    path: string,
    value: unknown,
    allowedFields: readonly string[],
): void {
    if (value === undefined) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path} must be an object`);
        return;
    }

    const allowed = new Set(allowedFields);
    for (const field of Object.keys(value)) {
        if (!allowed.has(field)) {
            errors.push(`Unknown Pimcore connector field "${path}.${field}"`);
        }
    }
}
