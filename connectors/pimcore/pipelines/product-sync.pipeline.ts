import { createPipeline } from '../../../src';
import { PipelineDefinition } from '../../../src/types';
import { PimcoreConnectorConfig } from '../types';
import { buildSafePathFilter } from '../utils/security.utils';

export function createProductSyncPipeline(config: PimcoreConnectorConfig): PipelineDefinition {
    const {
        connection,
        sync,
        mapping,
        pipelines,
        vendureChannel = '__default_channel__',
        defaultLanguage = 'en',
        languages = ['en'],
    } = config;

    const pipelineConfig = pipelines?.productSync ?? {};

    if (pipelineConfig.enabled === false) {
        return createPipeline()
            .name('Pimcore Product Sync (Disabled)')
            .description('Product sync is disabled')
            .trigger('MANUAL', { type: 'MANUAL' })
            .build();
    }

    const pipeline = createPipeline()
        .name(pipelineConfig.name ?? 'Pimcore Product Sync')
        .description('Sync products from Pimcore to Vendure')
        .capabilities({ requires: ['UpdateCatalog'] })
        ;

    if (pipelineConfig.schedule) {
        pipeline.trigger('scheduled', { type: 'SCHEDULE', cron: pipelineConfig.schedule, timezone: 'UTC' });
    }

    pipeline.trigger('MANUAL', { type: 'MANUAL', enabled: true });
    pipeline.trigger('WEBHOOK', {
        type: 'WEBHOOK',
        webhookCode: 'pimcore-product-sync',
        authentication: 'API_KEY',
        apiKeySecretCode: 'pimcore-webhook-key',
        rateLimit: 100,
    });

    pipeline.extract('fetch-products', {
        adapterCode: 'pimcoreGraphQL',
        'connection.endpoint': connection.endpoint,
        'connection.apiKeySecretCode': connection.apiKeySecretCode ?? 'pimcore-api-key',
        entityType: 'product',
        first: sync?.batchSize ?? 100,
        filter: buildSafePathFilter(sync?.pathFilter),
        defaultLanguage,
    });

    pipeline.validate('validate-products', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'id', required: true, error: 'Product ID required' } },
            { type: 'business', spec: { field: mapping?.product?.skuField ?? 'sku', required: true, error: 'SKU required' } },
            { type: 'business', spec: { field: mapping?.product?.nameField ?? 'name', required: true, error: 'Name required' } },
        ],
    });

    const nameField = mapping?.product?.nameField ?? 'name';
    const nameTemplate = languages.length > 1
        ? `\${${nameField}.${defaultLanguage} || ${nameField}}`
        : `\${${nameField}}`;

    pipeline.transform('transform-products', {
        operators: [
            { op: 'template', args: { template: nameTemplate, target: '_name' } },
            { op: 'coalesce', args: { paths: [mapping?.product?.skuField ?? 'sku', 'itemNumber', 'key'], target: '_sku' } },
            { op: 'slugify', args: { source: mapping?.product?.slugField ?? '_name', target: '_slug' } },
            { op: 'template', args: { template: 'pimcore:product:${id}', target: 'externalId' } },
            { op: 'set', args: { path: 'enabled', value: true } },
            { op: 'ifThenElse', args: { condition: { field: 'published', operator: 'eq', value: false }, thenValue: false, elseValue: true, target: 'enabled' } },
            {
                op: 'map',
                args: {
                    mapping: {
                        externalId: 'externalId',
                        sku: '_sku',
                        name: '_name',
                        slug: '_slug',
                        description: mapping?.product?.descriptionField ?? 'description',
                        enabled: 'enabled',
                        pimcoreId: 'id',
                        pimcorePath: 'fullPath',
                    },
                },
            },
        ],
    });

    pipeline.enrich('enrich-products', {
        sourceType: 'STATIC',
        defaults: { trackInventory: true },
        set: { syncedAt: '${@now}', syncSource: 'pimcore', channelCode: vendureChannel },
        computed: { 'customFields.pimcoreId': 'record.pimcoreId', 'customFields.pimcorePath': 'record.pimcorePath' },
    });

    if (sync?.deltaSync !== false) {
        pipeline.transform('delta-filter', {
            operators: [{
                op: 'deltaFilter',
                args: {
                    idPath: 'externalId',
                    includePaths: ['name', 'slug', 'description', 'enabled', 'sku'],
                    excludePaths: ['syncedAt', 'modificationDate'],
                },
            }],
        });
    }

    pipeline.load('upsert-products', {
        adapterCode: 'productUpsert',
        channel: vendureChannel,
        strategy: 'UPSERT',
        conflictResolution: 'SOURCE_WINS',
        skuField: 'sku',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
    });

    if (pipelineConfig.syncVariants !== false && sync?.includeVariants !== false) {
        pipeline.transform('extract-variants', {
            operators: [{
                op: 'flatten',
                args: { source: mapping?.product?.variantsField ?? 'variants', preserveParent: true, parentFields: ['_sku', 'externalId'] },
            }],
        });

        pipeline.transform('transform-variants', {
            operators: [
                { op: 'coalesce', args: { paths: ['sku', 'itemNumber', 'key'], target: 'variantSku' } },
                { op: 'template', args: { template: '${_parent._sku || _sku}-${variantSku || id}', target: 'variantSku' } },
                { op: 'template', args: { template: 'pimcore:variant:${id}', target: 'variantExternalId' } },
                { op: 'toNumber', args: { source: 'price' } },
                { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'priceInCents' } },
                { op: 'coalesce', args: { paths: ['name', 'key', 'variantSku'], target: 'variantName' } },
            ],
        });

        pipeline.load('upsert-variants', {
            adapterCode: 'variantUpsert',
            strategy: 'UPSERT',
            skuField: 'variantSku',
            nameField: 'variantName',
            priceField: 'priceInCents',
            stockField: 'stockQuantity',
            enabledField: 'published',
        });
    }

    pipeline.edge('MANUAL', 'fetch-products');
    pipeline.edge('WEBHOOK', 'fetch-products');
    if (pipelineConfig.schedule) pipeline.edge('scheduled', 'fetch-products');
    pipeline.edge('fetch-products', 'validate-products');
    pipeline.edge('validate-products', 'transform-products');
    pipeline.edge('transform-products', 'enrich-products');

    if (sync?.deltaSync !== false) {
        pipeline.edge('enrich-products', 'delta-filter');
        pipeline.edge('delta-filter', 'upsert-products');
    } else {
        pipeline.edge('enrich-products', 'upsert-products');
    }

    if (pipelineConfig.syncVariants !== false && sync?.includeVariants !== false) {
        pipeline.edge('upsert-products', 'extract-variants');
        pipeline.edge('extract-variants', 'transform-variants');
        pipeline.edge('transform-variants', 'upsert-variants');
    }

    pipeline.hooks({
        PIPELINE_COMPLETED: [{ type: 'LOG', name: 'Log completion' }],
        PIPELINE_FAILED: [{ type: 'LOG', name: 'Log failure' }],
    });

    return pipeline.build();
}

export default createProductSyncPipeline;
