import { createPipeline } from '../../../src';
import { PipelineDefinition } from '../../../src/types';
import { PimcoreConnectorConfig } from '../types';
import { buildSafePathFilter, buildSafeMimeTypeFilter, combineFilters } from '../utils/security.utils';

export function createAssetSyncPipeline(config: PimcoreConnectorConfig): PipelineDefinition {
    const { connection, sync, pipelines } = config;

    const pipelineConfig = pipelines?.assetSync ?? {};

    if (pipelineConfig.enabled === false) {
        return createPipeline()
            .name('Pimcore Asset Sync (Disabled)')
            .description('Asset sync is disabled')
            .trigger('manual', { type: 'manual' })
            .build();
    }

    const pipeline = createPipeline()
        .name(pipelineConfig.name ?? 'Pimcore Asset Sync')
        .description('Sync assets from Pimcore DAM to Vendure')
        .capabilities({ requires: ['UpdateCatalog'] });

    if (pipelineConfig.schedule) {
        pipeline.trigger('scheduled', { type: 'schedule', cron: pipelineConfig.schedule, timezone: 'UTC' });
    }

    pipeline.trigger('manual', { type: 'manual', enabled: true });

    const pathFilter = buildSafePathFilter(pipelineConfig.folderPath);
    const mimeTypes = pipelineConfig.mimeTypes?.length ? pipelineConfig.mimeTypes : ['image/jpeg', 'image/png', 'image/webp'];
    const mimeFilter = buildSafeMimeTypeFilter(mimeTypes);
    const filter = combineFilters([pathFilter, mimeFilter]);

    let assetBaseUrl: string;
    try {
        assetBaseUrl = new URL(connection.endpoint).origin;
    } catch {
        assetBaseUrl = connection.endpoint.replace(/\/[^/]+$/, '');
    }

    pipeline.extract('fetch-assets', {
        adapterCode: 'pimcoreGraphQL',
        'connection.endpoint': connection.endpoint,
        'connection.apiKeySecretCode': connection.apiKeySecretCode ?? 'pimcore-api-key',
        entityType: 'asset',
        first: sync?.batchSize ?? 50,
        filter,
    });

    pipeline.validate('validate-assets', {
        mode: 'accumulate',
        rules: [
            { type: 'business', spec: { field: 'id', required: true, error: 'Asset ID required' } },
            { type: 'business', spec: { field: 'fullPath', required: true, error: 'Asset path required' } },
            { type: 'business', spec: { field: 'filename', required: true, error: 'Filename required' } },
        ],
    });

    pipeline.transform('transform-assets', {
        operators: [
            { op: 'template', args: { template: 'pimcore:asset:${id}', target: 'externalId' } },
            { op: 'template', args: { template: `${assetBaseUrl}\${fullPath}`, target: 'sourceUrl' } },
            {
                op: 'map',
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
                op: 'deltaFilter',
                args: {
                    idPath: 'externalId',
                    includePaths: ['sourceUrl', 'filename'],
                },
            }],
        });
    }

    pipeline.load('import-assets', {
        adapterCode: 'assetImport',
        sourceUrlField: 'sourceUrl',
        filenameField: 'filename',
        nameField: 'name',
    });

    pipeline.edge('manual', 'fetch-assets');
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
        PIPELINE_COMPLETED: [{ type: 'LOG', name: 'Log completion' }],
        PIPELINE_FAILED: [{ type: 'LOG', name: 'Log failure' }],
    });

    return pipeline.build();
}

export default createAssetSyncPipeline;
