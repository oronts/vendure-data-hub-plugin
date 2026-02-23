import { createPipeline } from '../../../src';
import { PipelineDefinition } from '../../../src/types';
import { TRIGGER_TYPE, VALIDATION_MODE, HOOK_STAGE } from '../../../shared/constants/enums';
import { LOADER_CODE } from '../../../src/constants/adapters';
import { TRANSFORM_OPERATOR, HOOK_ACTION, ROUTE_OPERATOR } from '../../../src/sdk/constants';
import { pimcoreGraphQLExtractor } from '../extractors/pimcore-graphql.extractor';
import { PimcoreConnectorConfig } from '../types';
import { PIMCORE_API_KEY_SECRET, PIMCORE_WEBHOOK_KEY_SECRET, PIMCORE_WEBHOOK_SIGNATURE } from '../index';
import { buildSafePathFilter } from '../utils/security.utils';
import { DEFAULT_CHANNEL_CODE } from '../../../shared/constants';

export function createCategorySyncPipeline(config: PimcoreConnectorConfig): PipelineDefinition {
    const {
        connection,
        sync,
        mapping,
        pipelines,
        vendureChannel = DEFAULT_CHANNEL_CODE,
        defaultLanguage = 'en',
        languages = ['en'],
    } = config;

    const pipelineConfig = pipelines?.categorySync ?? {};

    if (pipelineConfig.enabled === false) {
        return createPipeline()
            .name('Pimcore Category Sync (Disabled)')
            .description('Category sync is disabled')
            .trigger(TRIGGER_TYPE.MANUAL, { type: TRIGGER_TYPE.MANUAL })
            .build();
    }

    const pipeline = createPipeline()
        .name(pipelineConfig.name ?? 'Pimcore Category Sync')
        .description('Sync categories from Pimcore to Vendure collections')
        .capabilities({ requires: ['UpdateCatalog'] })
        ;

    if (pipelineConfig.schedule) {
        pipeline.trigger('scheduled', { type: TRIGGER_TYPE.SCHEDULE, cron: pipelineConfig.schedule, timezone: 'UTC' });
    }

    pipeline.trigger(TRIGGER_TYPE.MANUAL, { type: TRIGGER_TYPE.MANUAL, enabled: true });
    pipeline.trigger(TRIGGER_TYPE.WEBHOOK, {
        type: TRIGGER_TYPE.WEBHOOK,
        webhookCode: 'pimcore-category-sync',
        signature: PIMCORE_WEBHOOK_SIGNATURE,
        hmacSecretCode: PIMCORE_WEBHOOK_KEY_SECRET,
        rateLimit: 50,
    });

    const pathFilter = buildSafePathFilter(pipelineConfig.rootPath ?? sync?.pathFilter);

    pipeline.extract('fetch-categories', {
        adapterCode: pimcoreGraphQLExtractor.code,
        'connection.endpoint': connection.endpoint,
        'connection.apiKeySecretCode': connection.apiKeySecretCode ?? PIMCORE_API_KEY_SECRET,
        entityType: 'category',
        first: sync?.batchSize ?? 200,
        filter: pathFilter,
        defaultLanguage,
    });

    pipeline.validate('validate-categories', {
        errorHandlingMode: VALIDATION_MODE.ACCUMULATE,
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
            { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: nameTemplate, target: '_name' } },
            { op: TRANSFORM_OPERATOR.COALESCE, args: { paths: [mapping?.category?.slugField ?? 'slug', 'key'], target: '_slugSource' } },
            { op: TRANSFORM_OPERATOR.SLUGIFY, args: { source: '_slugSource', target: '_slug' } },
            { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: 'pimcore:category:${id}', target: 'externalId' } },
            { op: TRANSFORM_OPERATOR.IF_THEN_ELSE, args: { condition: { field: `${mapping?.category?.parentField ?? 'parent'}.id`, cmp: ROUTE_OPERATOR.NE, value: null }, thenValue: true, elseValue: false, target: '_hasParent' } },
            { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: 'pimcore:category:${parent.id}', target: 'parentExternalId', skipIfEmpty: true } },
            { op: TRANSFORM_OPERATOR.COALESCE, args: { paths: [mapping?.category?.positionField ?? 'position', 'index'], target: '_position' } },
            { op: TRANSFORM_OPERATOR.TO_NUMBER, args: { source: '_position' } },
            {
                op: TRANSFORM_OPERATOR.MAP,
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
            { op: TRANSFORM_OPERATOR.IF_THEN_ELSE, args: { condition: { field: 'isPrivate', operator: ROUTE_OPERATOR.EQ, value: true }, thenValue: false, elseValue: true, target: 'isPrivate' } },
        ],
    });

    pipeline.enrich('enrich-categories', {
        sourceType: 'STATIC',
        set: { syncedAt: '${@now}', syncSource: 'pimcore', channelCode: vendureChannel },
        computed: { 'customFields.pimcoreId': 'record.pimcoreId', 'customFields.pimcorePath': 'record.pimcorePath' },
    });

    pipeline.load('upsert-collections', {
        adapterCode: LOADER_CODE.COLLECTION_UPSERT,
        channel: vendureChannel,
        slugField: 'slug',
        nameField: 'name',
        parentSlugField: 'parentExternalId',
        descriptionField: 'description',
    });

    pipeline.edge(TRIGGER_TYPE.MANUAL, 'fetch-categories');
    pipeline.edge(TRIGGER_TYPE.WEBHOOK, 'fetch-categories');
    if (pipelineConfig.schedule) pipeline.edge('scheduled', 'fetch-categories');
    pipeline.edge('fetch-categories', 'validate-categories');
    pipeline.edge('validate-categories', 'transform-categories');
    pipeline.edge('transform-categories', 'enrich-categories');
    pipeline.edge('enrich-categories', 'upsert-collections');

    pipeline.hooks({
        [HOOK_STAGE.PIPELINE_COMPLETED]: [{ type: HOOK_ACTION.LOG, name: 'Log completion' }],
        [HOOK_STAGE.PIPELINE_FAILED]: [{ type: HOOK_ACTION.LOG, name: 'Log failure' }],
    });

    return pipeline.build();
}
