import { createPipeline } from '../../../src';
import { PipelineDefinition } from '../../../src/types';
import { TRIGGER_TYPE, LOAD_STRATEGY, CONFLICT_STRATEGY, VALIDATION_MODE, HOOK_STAGE } from '../../../shared/constants/enums';
import { LOADER_CODE } from '../../../src/constants/adapters';
import { TRANSFORM_OPERATOR, HOOK_ACTION, ROUTE_OPERATOR } from '../../../src/sdk/constants';
import { pimcoreGraphQLExtractor } from '../extractors/pimcore-graphql.extractor';
import { PimcoreConnectorConfig } from '../types';
import { PIMCORE_API_KEY_SECRET, PIMCORE_WEBHOOK_KEY_SECRET, PIMCORE_WEBHOOK_SIGNATURE } from '../index';
import { buildSafePathFilter } from '../utils/security.utils';
import { DEFAULT_CHANNEL_CODE } from '../../../shared/constants';

export function createProductSyncPipeline(config: PimcoreConnectorConfig): PipelineDefinition {
    const {
        connection,
        sync,
        mapping,
        pipelines,
        vendureChannel = DEFAULT_CHANNEL_CODE,
        defaultLanguage = 'en',
        languages = ['en'],
    } = config;

    const pipelineConfig = pipelines?.productSync ?? {};

    if (pipelineConfig.enabled === false) {
        return createPipeline()
            .name('Pimcore Product Sync (Disabled)')
            .description('Product sync is disabled')
            .trigger(TRIGGER_TYPE.MANUAL, { type: TRIGGER_TYPE.MANUAL })
            .build();
    }

    const pipeline = createPipeline()
        .name(pipelineConfig.name ?? 'Pimcore Product Sync')
        .description('Sync products from Pimcore to Vendure')
        .capabilities({ requires: ['UpdateCatalog'] })
        ;

    if (pipelineConfig.schedule) {
        pipeline.trigger('scheduled', { type: TRIGGER_TYPE.SCHEDULE, cron: pipelineConfig.schedule, timezone: 'UTC' });
    }

    pipeline.trigger(TRIGGER_TYPE.MANUAL, { type: TRIGGER_TYPE.MANUAL, enabled: true });
    pipeline.trigger(TRIGGER_TYPE.WEBHOOK, {
        type: TRIGGER_TYPE.WEBHOOK,
        webhookCode: 'pimcore-product-sync',
        signature: PIMCORE_WEBHOOK_SIGNATURE,
        hmacSecretCode: PIMCORE_WEBHOOK_KEY_SECRET,
        rateLimit: 100,
    });

    pipeline.extract('fetch-products', {
        adapterCode: pimcoreGraphQLExtractor.code,
        'connection.endpoint': connection.endpoint,
        'connection.apiKeySecretCode': connection.apiKeySecretCode ?? PIMCORE_API_KEY_SECRET,
        entityType: 'product',
        first: sync?.batchSize ?? 100,
        filter: buildSafePathFilter(sync?.pathFilter),
        defaultLanguage,
    });

    pipeline.validate('validate-products', {
        errorHandlingMode: VALIDATION_MODE.ACCUMULATE,
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
            { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: nameTemplate, target: '_name' } },
            { op: TRANSFORM_OPERATOR.COALESCE, args: { paths: [mapping?.product?.skuField ?? 'sku', 'itemNumber', 'key'], target: '_sku' } },
            { op: TRANSFORM_OPERATOR.SLUGIFY, args: { source: mapping?.product?.slugField ?? '_name', target: '_slug' } },
            { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: 'pimcore:product:${id}', target: 'externalId' } },
            { op: TRANSFORM_OPERATOR.SET, args: { path: 'enabled', value: true } },
            { op: TRANSFORM_OPERATOR.IF_THEN_ELSE, args: { condition: { field: 'published', operator: ROUTE_OPERATOR.EQ, value: false }, thenValue: false, elseValue: true, target: 'enabled' } },
            {
                op: TRANSFORM_OPERATOR.MAP,
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
                op: TRANSFORM_OPERATOR.DELTA_FILTER,
                args: {
                    idPath: 'externalId',
                    includePaths: ['name', 'slug', 'description', 'enabled', 'sku'],
                    excludePaths: ['syncedAt', 'modificationDate'],
                },
            }],
        });
    }

    pipeline.load('upsert-products', {
        adapterCode: LOADER_CODE.PRODUCT_UPSERT,
        channel: vendureChannel,
        strategy: LOAD_STRATEGY.UPSERT,
        conflictStrategy: CONFLICT_STRATEGY.SOURCE_WINS,
        skuField: 'sku',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
    });

    if (pipelineConfig.syncVariants !== false && sync?.includeVariants !== false) {
        pipeline.transform('extract-variants', {
            operators: [{
                op: TRANSFORM_OPERATOR.FLATTEN,
                args: { source: mapping?.product?.variantsField ?? 'variants', preserveParent: true, parentFields: ['_sku', 'externalId'] },
            }],
        });

        pipeline.transform('transform-variants', {
            operators: [
                { op: TRANSFORM_OPERATOR.COALESCE, args: { paths: ['sku', 'itemNumber', 'key'], target: 'variantSku' } },
                { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: '${_parent._sku || _sku}-${variantSku || id}', target: 'variantSku' } },
                { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: 'pimcore:variant:${id}', target: 'variantExternalId' } },
                { op: TRANSFORM_OPERATOR.TO_NUMBER, args: { source: 'price' } },
                { op: TRANSFORM_OPERATOR.MATH, args: { operation: 'multiply', source: 'price', operand: '100', target: 'priceInCents' } },
                { op: TRANSFORM_OPERATOR.COALESCE, args: { paths: ['name', 'key', 'variantSku'], target: 'variantName' } },
            ],
        });

        pipeline.load('upsert-variants', {
            adapterCode: LOADER_CODE.VARIANT_UPSERT,
            strategy: LOAD_STRATEGY.UPSERT,
            skuField: 'variantSku',
            nameField: 'variantName',
            priceField: 'priceInCents',
            stockField: 'stockQuantity',
            enabledField: 'published',
        });
    }

    pipeline.edge(TRIGGER_TYPE.MANUAL, 'fetch-products');
    pipeline.edge(TRIGGER_TYPE.WEBHOOK, 'fetch-products');
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
        [HOOK_STAGE.PIPELINE_COMPLETED]: [{ type: HOOK_ACTION.LOG, name: 'Log completion' }],
        [HOOK_STAGE.PIPELINE_FAILED]: [{ type: HOOK_ACTION.LOG, name: 'Log failure' }],
    });

    return pipeline.build();
}
