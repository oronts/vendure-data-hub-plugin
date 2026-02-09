import { createPipeline } from '../../../src';
import { PipelineDefinition } from '../../../src/types';
import { PimcoreConnectorConfig } from '../types';

export function createFacetSyncPipeline(config: PimcoreConnectorConfig): PipelineDefinition {
    const {
        connection,
        pipelines,
        vendureChannel = '__default_channel__',
        defaultLanguage = 'en',
    } = config;

    const pipelineConfig = pipelines?.facetSync ?? {};

    if (pipelineConfig.enabled === false) {
        return createPipeline()
            .name('Pimcore Facet Sync (Disabled)')
            .description('Facet sync is disabled')
            .trigger('MANUAL', { type: 'MANUAL' })
            .build();
    }

    const pipeline = createPipeline()
        .name(pipelineConfig.name ?? 'Pimcore Facet Sync')
        .description('Sync attributes from Pimcore to Vendure facets')
        .capabilities({ requires: ['UpdateCatalog'] });

    if (pipelineConfig.schedule) {
        pipeline.trigger('scheduled', { type: 'SCHEDULE', cron: pipelineConfig.schedule, timezone: 'UTC' });
    }

    pipeline.trigger('MANUAL', { type: 'MANUAL', enabled: true });

    pipeline.extract('fetch-facets', {
        adapterCode: 'pimcoreGraphQL',
        'connection.endpoint': connection.endpoint,
        'connection.apiKeySecretCode': connection.apiKeySecretCode ?? 'pimcore-api-key',
        entityType: 'facet',
        first: 100,
        defaultLanguage,
    });

    pipeline.validate('validate-facets', {
        mode: 'accumulate',
        rules: [
            { type: 'business', spec: { field: 'key', required: true, error: 'Facet key required' } },
        ],
    });

    pipeline.transform('transform-facets', {
        operators: [
            { op: 'template', args: { template: 'pimcore:facet:${key}', target: 'externalId' } },
            { op: 'slugify', args: { source: 'key', target: 'code' } },
            { op: 'coalesce', args: { fields: ['title', 'key'], target: 'name' } },
            {
                op: 'map',
                args: {
                    mapping: { externalId: 'externalId', code: 'code', name: 'name', options: 'options' },
                },
            },
        ],
    });

    pipeline.load('upsert-facets', {
        adapterCode: 'facetUpsert',
        codeField: 'code',
        nameField: 'name',
        channel: vendureChannel,
    });

    pipeline.transform('extract-facet-values', {
        operators: [{ op: 'flatten', args: { source: 'options', preserveParent: true, parentFields: ['code'] } }],
    });

    pipeline.transform('transform-facet-values', {
        operators: [
            { op: 'slugify', args: { source: 'key', target: 'valueCode' } },
            { op: 'coalesce', args: { fields: ['value', 'key'], target: 'valueName' } },
            {
                op: 'map',
                args: {
                    mapping: { facetCode: '_parent.code', code: 'valueCode', name: 'valueName' },
                },
            },
        ],
    });

    pipeline.load('upsert-facet-values', {
        adapterCode: 'facetValueUpsert',
        facetCodeField: 'facetCode',
        codeField: 'code',
        nameField: 'name',
        channel: vendureChannel,
    });

    pipeline.edge('MANUAL', 'fetch-facets');
    if (pipelineConfig.schedule) pipeline.edge('scheduled', 'fetch-facets');
    pipeline.edge('fetch-facets', 'validate-facets');
    pipeline.edge('validate-facets', 'transform-facets');
    pipeline.edge('transform-facets', 'upsert-facets');
    pipeline.edge('upsert-facets', 'extract-facet-values');
    pipeline.edge('extract-facet-values', 'transform-facet-values');
    pipeline.edge('transform-facet-values', 'upsert-facet-values');

    pipeline.hooks({
        PIPELINE_COMPLETED: [{ type: 'LOG', name: 'Log completion' }],
        PIPELINE_FAILED: [{ type: 'LOG', name: 'Log failure' }],
    });

    return pipeline.build();
}

export default createFacetSyncPipeline;
