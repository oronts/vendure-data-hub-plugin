import { createPipeline } from '../../../src';
import { PipelineDefinition } from '../../../src/types';
import { PimcoreConnectorConfig } from '../types';
import { buildSafePathFilter } from '../utils/security.utils';

export function createCategorySyncPipeline(config: PimcoreConnectorConfig): PipelineDefinition {
    const {
        connection,
        sync,
        mapping,
        pipelines,
        vendureChannel = '__default_channel__',
        defaultLanguage = 'en',
        languages = ['en'],
    } = config;

    const pipelineConfig = pipelines?.categorySync ?? {};

    if (pipelineConfig.enabled === false) {
        return createPipeline()
            .name('Pimcore Category Sync (Disabled)')
            .description('Category sync is disabled')
            .trigger('manual', { type: 'manual' })
            .build();
    }

    const pipeline = createPipeline()
        .name(pipelineConfig.name ?? 'Pimcore Category Sync')
        .description('Sync categories from Pimcore to Vendure collections')
        .capabilities({ requires: ['UpdateCatalog'] })
        ;

    if (pipelineConfig.schedule) {
        pipeline.trigger('scheduled', { type: 'schedule', cron: pipelineConfig.schedule, timezone: 'UTC' });
    }

    pipeline.trigger('manual', { type: 'manual', enabled: true });
    pipeline.trigger('webhook', {
        type: 'webhook',
        webhookCode: 'pimcore-category-sync',
        authentication: 'api-key',
        apiKeySecretCode: 'pimcore-webhook-key',
        rateLimit: 50,
    });

    const pathFilter = buildSafePathFilter(pipelineConfig.rootPath ?? sync?.pathFilter);

    pipeline.extract('fetch-categories', {
        adapterCode: 'pimcoreGraphQL',
        'connection.endpoint': connection.endpoint,
        'connection.apiKeySecretCode': connection.apiKeySecretCode ?? 'pimcore-api-key',
        entityType: 'category',
        first: sync?.batchSize ?? 200,
        filter: pathFilter,
        defaultLanguage,
    });

    pipeline.validate('validate-categories', {
        mode: 'accumulate',
        rules: [
            { type: 'business', spec: { field: 'id', required: true, error: 'Category ID required' } },
            { type: 'business', spec: { field: mapping?.category?.nameField ?? 'name', required: true, error: 'Name required' } },
        ],
    });

    const nameField = mapping?.category?.nameField ?? 'name';
    const nameTemplate = languages.length > 1
        ? `\${${nameField}.${defaultLanguage} || ${nameField}}`
        : `\${${nameField}}`;

    pipeline.transform('transform-categories', {
        operators: [
            { op: 'template', args: { template: nameTemplate, target: '_name' } },
            { op: 'coalesce', args: { fields: [mapping?.category?.slugField ?? 'slug', 'key'], target: '_slugSource' } },
            { op: 'slugify', args: { source: '_slugSource', target: '_slug' } },
            { op: 'template', args: { template: 'pimcore:category:${id}', target: 'externalId' } },
            { op: 'when', args: { conditions: [{ field: `${mapping?.category?.parentField ?? 'parent'}.id`, cmp: 'exists', value: true }], action: 'set' } },
            { op: 'template', args: { template: 'pimcore:category:${parent.id}', target: 'parentExternalId', skipIfEmpty: true } },
            { op: 'coalesce', args: { fields: [mapping?.category?.positionField ?? 'position', 'index'], target: '_position' } },
            { op: 'toNumber', args: { source: '_position' } },
            {
                op: 'map',
                args: {
                    mapping: {
                        externalId: 'externalId',
                        name: '_name',
                        slug: '_slug',
                        description: mapping?.category?.descriptionField ?? 'description',
                        parentExternalId: 'parentExternalId',
                        position: '_position',
                        isPrivate: 'published',
                        pimcoreId: 'id',
                        pimcorePath: 'fullPath',
                    },
                },
            },
            { op: 'when', args: { conditions: [{ field: 'isPrivate', cmp: 'eq', value: true }], action: 'set', setValue: { isPrivate: false } } },
            { op: 'when', args: { conditions: [{ field: 'isPrivate', cmp: 'neq', value: false }], action: 'set', setValue: { isPrivate: true } } },
        ],
    });

    pipeline.enrich('enrich-categories', {
        sourceType: 'STATIC',
        set: { syncedAt: '${@now}', syncSource: 'pimcore', channelCode: vendureChannel },
        computed: { 'customFields.pimcoreId': 'record.pimcoreId', 'customFields.pimcorePath': 'record.pimcorePath' },
    });

    pipeline.load('upsert-collections', {
        adapterCode: 'collectionUpsert',
        channel: vendureChannel,
        slugField: 'slug',
        nameField: 'name',
        parentSlugField: 'parentExternalId',
        descriptionField: 'description',
    });

    pipeline.edge('manual', 'fetch-categories');
    pipeline.edge('webhook', 'fetch-categories');
    if (pipelineConfig.schedule) pipeline.edge('scheduled', 'fetch-categories');
    pipeline.edge('fetch-categories', 'validate-categories');
    pipeline.edge('validate-categories', 'transform-categories');
    pipeline.edge('transform-categories', 'enrich-categories');
    pipeline.edge('enrich-categories', 'upsert-collections');

    pipeline.hooks({
        PIPELINE_COMPLETED: [{ type: 'LOG', name: 'Log completion' }],
        PIPELINE_FAILED: [{ type: 'LOG', name: 'Log failure' }],
    });

    return pipeline.build();
}

export default createCategorySyncPipeline;
