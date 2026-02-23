import { createPipeline } from '../../../src';
import { PipelineDefinition } from '../../../src/types';
import { TRIGGER_TYPE, VALIDATION_MODE, HOOK_STAGE } from '../../../shared/constants/enums';
import { LOADER_CODE } from '../../../src/constants/adapters';
import { TRANSFORM_OPERATOR, HOOK_ACTION } from '../../../src/sdk/constants';
import { pimcoreGraphQLExtractor } from '../extractors/pimcore-graphql.extractor';
import { PimcoreConnectorConfig } from '../types';
import { PIMCORE_API_KEY_SECRET } from '../index';
import { DEFAULT_CHANNEL_CODE } from '../../../shared/constants';

export function createFacetSyncPipeline(config: PimcoreConnectorConfig): PipelineDefinition {
    const {
        connection,
        pipelines,
        vendureChannel = DEFAULT_CHANNEL_CODE,
        defaultLanguage = 'en',
    } = config;

    const pipelineConfig = pipelines?.facetSync ?? {};

    if (pipelineConfig.enabled === false) {
        return createPipeline()
            .name('Pimcore Facet Sync (Disabled)')
            .description('Facet sync is disabled')
            .trigger(TRIGGER_TYPE.MANUAL, { type: TRIGGER_TYPE.MANUAL })
            .build();
    }

    const pipeline = createPipeline()
        .name(pipelineConfig.name ?? 'Pimcore Facet Sync')
        .description('Sync attributes from Pimcore to Vendure facets')
        .capabilities({ requires: ['UpdateCatalog'] });

    if (pipelineConfig.schedule) {
        pipeline.trigger('scheduled', { type: TRIGGER_TYPE.SCHEDULE, cron: pipelineConfig.schedule, timezone: 'UTC' });
    }

    pipeline.trigger(TRIGGER_TYPE.MANUAL, { type: TRIGGER_TYPE.MANUAL, enabled: true });

    pipeline.extract('fetch-facets', {
        adapterCode: pimcoreGraphQLExtractor.code,
        'connection.endpoint': connection.endpoint,
        'connection.apiKeySecretCode': connection.apiKeySecretCode ?? PIMCORE_API_KEY_SECRET,
        entityType: 'facet',
        first: 100,
        defaultLanguage,
    });

    pipeline.validate('validate-facets', {
        errorHandlingMode: VALIDATION_MODE.ACCUMULATE,
        rules: [
            { type: 'business', spec: { field: 'key', required: true, error: 'Facet key required' } },
        ],
    });

    pipeline.transform('transform-facets', {
        operators: [
            { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: 'pimcore:facet:${key}', target: 'externalId' } },
            { op: TRANSFORM_OPERATOR.SLUGIFY, args: { source: 'key', target: 'code' } },
            { op: TRANSFORM_OPERATOR.COALESCE, args: { paths: ['title', 'key'], target: 'name' } },
            {
                op: TRANSFORM_OPERATOR.MAP,
                args: {
                    mapping: { externalId: 'externalId', code: 'code', name: 'name', options: 'options' },
                },
            },
        ],
    });

    pipeline.load('upsert-facets', {
        adapterCode: LOADER_CODE.FACET_UPSERT,
        codeField: 'code',
        nameField: 'name',
        channel: vendureChannel,
    });

    pipeline.transform('extract-facet-values', {
        operators: [{ op: TRANSFORM_OPERATOR.FLATTEN, args: { source: 'options', preserveParent: true, parentFields: ['code'] } }],
    });

    pipeline.transform('transform-facet-values', {
        operators: [
            { op: TRANSFORM_OPERATOR.SLUGIFY, args: { source: 'key', target: 'valueCode' } },
            { op: TRANSFORM_OPERATOR.COALESCE, args: { paths: ['value', 'key'], target: 'valueName' } },
            {
                op: TRANSFORM_OPERATOR.MAP,
                args: {
                    mapping: { facetCode: '_parent.code', code: 'valueCode', name: 'valueName' },
                },
            },
        ],
    });

    pipeline.load('upsert-facet-values', {
        adapterCode: LOADER_CODE.FACET_VALUE_UPSERT,
        facetCodeField: 'facetCode',
        codeField: 'code',
        nameField: 'name',
        channel: vendureChannel,
    });

    pipeline.edge(TRIGGER_TYPE.MANUAL, 'fetch-facets');
    if (pipelineConfig.schedule) pipeline.edge('scheduled', 'fetch-facets');
    pipeline.edge('fetch-facets', 'validate-facets');
    pipeline.edge('validate-facets', 'transform-facets');
    pipeline.edge('transform-facets', 'upsert-facets');
    pipeline.edge('upsert-facets', 'extract-facet-values');
    pipeline.edge('extract-facet-values', 'transform-facet-values');
    pipeline.edge('transform-facet-values', 'upsert-facet-values');

    pipeline.hooks({
        [HOOK_STAGE.PIPELINE_COMPLETED]: [{ type: HOOK_ACTION.LOG, name: 'Log completion' }],
        [HOOK_STAGE.PIPELINE_FAILED]: [{ type: HOOK_ACTION.LOG, name: 'Log failure' }],
    });

    return pipeline.build();
}
