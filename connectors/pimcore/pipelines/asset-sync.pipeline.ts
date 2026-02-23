import { createPipeline } from '../../../src';
import { PipelineDefinition } from '../../../src/types';
import { TRIGGER_TYPE, VALIDATION_MODE, HOOK_STAGE } from '../../../shared/constants/enums';
import { LOADER_CODE } from '../../../src/constants/adapters';
import { TRANSFORM_OPERATOR, HOOK_ACTION } from '../../../src/sdk/constants';
import { pimcoreGraphQLExtractor } from '../extractors/pimcore-graphql.extractor';
import { PimcoreConnectorConfig } from '../types';
import { PIMCORE_API_KEY_SECRET } from '../index';
import { buildSafePathFilter, buildSafeMimeTypeFilter, combineFilters } from '../utils/security.utils';

const DEFAULT_ASSET_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function createAssetSyncPipeline(config: PimcoreConnectorConfig): PipelineDefinition {
    const { connection, sync, pipelines } = config;

    const pipelineConfig = pipelines?.assetSync ?? {};

    if (pipelineConfig.enabled === false) {
        return createPipeline()
            .name('Pimcore Asset Sync (Disabled)')
            .description('Asset sync is disabled')
            .trigger(TRIGGER_TYPE.MANUAL, { type: TRIGGER_TYPE.MANUAL })
            .build();
    }

    const pipeline = createPipeline()
        .name(pipelineConfig.name ?? 'Pimcore Asset Sync')
        .description('Sync assets from Pimcore DAM to Vendure')
        .capabilities({ requires: ['UpdateCatalog'] });

    if (pipelineConfig.schedule) {
        pipeline.trigger('scheduled', { type: TRIGGER_TYPE.SCHEDULE, cron: pipelineConfig.schedule, timezone: 'UTC' });
    }

    pipeline.trigger(TRIGGER_TYPE.MANUAL, { type: TRIGGER_TYPE.MANUAL, enabled: true });

    const pathFilter = buildSafePathFilter(pipelineConfig.folderPath);
    const mimeTypes = pipelineConfig.mimeTypes?.length ? pipelineConfig.mimeTypes : DEFAULT_ASSET_MIME_TYPES;
    const mimeFilter = buildSafeMimeTypeFilter(mimeTypes);
    const filter = combineFilters([pathFilter, mimeFilter]);

    let assetBaseUrl: string;
    try {
        assetBaseUrl = new URL(connection.endpoint).origin;
    } catch {
        assetBaseUrl = connection.endpoint.replace(/\/[^/]+$/, '');
    }

    pipeline.extract('fetch-assets', {
        adapterCode: pimcoreGraphQLExtractor.code,
        'connection.endpoint': connection.endpoint,
        'connection.apiKeySecretCode': connection.apiKeySecretCode ?? PIMCORE_API_KEY_SECRET,
        entityType: 'asset',
        first: sync?.batchSize ?? 50,
        filter,
    });

    pipeline.validate('validate-assets', {
        errorHandlingMode: VALIDATION_MODE.ACCUMULATE,
        rules: [
            { type: 'business', spec: { field: 'id', required: true, error: 'Asset ID required' } },
            { type: 'business', spec: { field: 'fullPath', required: true, error: 'Asset path required' } },
            { type: 'business', spec: { field: 'filename', required: true, error: 'Filename required' } },
        ],
    });

    pipeline.transform('transform-assets', {
        operators: [
            { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: 'pimcore:asset:${id}', target: 'externalId' } },
            { op: TRANSFORM_OPERATOR.TEMPLATE, args: { template: `${assetBaseUrl}\${fullPath}`, target: 'sourceUrl' } },
            {
                op: TRANSFORM_OPERATOR.MAP,
                args: {
                    mapping: {
                        externalId: 'externalId',
                        sourceUrl: 'sourceUrl',
                        filename: 'filename',
                        name: 'filename',
                        mimeType: 'mimetype',
                    },
                },
            },
        ],
    });

    if (sync?.deltaSync !== false) {
        pipeline.transform('delta-filter', {
            operators: [{
                op: TRANSFORM_OPERATOR.DELTA_FILTER,
                args: {
                    idPath: 'externalId',
                    includePaths: ['sourceUrl', 'filename'],
                },
            }],
        });
    }

    pipeline.load('import-assets', {
        adapterCode: LOADER_CODE.ASSET_IMPORT,
        sourceUrlField: 'sourceUrl',
        filenameField: 'filename',
        nameField: 'name',
    });

    pipeline.edge(TRIGGER_TYPE.MANUAL, 'fetch-assets');
    if (pipelineConfig.schedule) pipeline.edge('scheduled', 'fetch-assets');
    pipeline.edge('fetch-assets', 'validate-assets');
    pipeline.edge('validate-assets', 'transform-assets');

    if (sync?.deltaSync !== false) {
        pipeline.edge('transform-assets', 'delta-filter');
        pipeline.edge('delta-filter', 'import-assets');
    } else {
        pipeline.edge('transform-assets', 'import-assets');
    }

    pipeline.hooks({
        [HOOK_STAGE.PIPELINE_COMPLETED]: [{ type: HOOK_ACTION.LOG, name: 'Log completion' }],
        [HOOK_STAGE.PIPELINE_FAILED]: [{ type: HOOK_ACTION.LOG, name: 'Log failure' }],
    });

    return pipeline.build();
}
