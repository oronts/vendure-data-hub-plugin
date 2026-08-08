import { describe, expect, it } from 'vitest';
import type { ExportConfiguration } from '../components/wizards/export-wizard/types';
import type { DestinationConfig } from '../types/wizard';
import type { DestinationSchema } from '../hooks/api/use-config-options';
import { exportConfigToPipelineDefinition } from './wizard-to-pipeline';

const resolver = {
    getExportAdapterCode: (format: string) =>
        format === 'CSV' ? 'csvExport' : undefined,
};

const destinationSchemas: DestinationSchema[] = [
    {
        type: 'LOCAL',
        label: 'Local',
        configKey: 'localConfig',
        fields: [
            {
                key: 'directory',
                label: 'Directory',
                type: 'text',
                required: true,
                defaultValue: '.',
            },
        ],
    },
    {
        type: 'HTTP',
        label: 'HTTP',
        configKey: 'httpConfig',
        fields: [
            { key: 'url', label: 'URL', type: 'text', required: true },
            {
                key: 'method',
                label: 'Method',
                type: 'select',
                defaultValue: 'POST',
            },
            {
                key: 'auth.type',
                label: 'Auth',
                type: 'select',
                defaultValue: 'NONE',
            },
        ],
    },
];

function configuration(destination: DestinationConfig): ExportConfiguration {
    return {
        name: 'Catalog export',
        sourceEntity: 'PRODUCT',
        sourceQuery: { type: 'all' },
        fields: [{ sourceField: 'id', outputName: 'id', include: true }],
        format: { type: 'CSV', options: {} },
        destination,
        trigger: { type: 'MANUAL' },
        options: {
            batchSize: 100,
        },
    };
}

function exportConfig(destination: DestinationConfig): Record<string, unknown> {
    const definition = exportConfigToPipelineDefinition(
        configuration(destination),
        resolver,
        undefined,
        destinationSchemas,
    );
    return (
        definition.steps.find((step) => step.type === 'EXPORT')?.config ?? {}
    );
}

function convert(config: ExportConfiguration) {
    return exportConfigToPipelineDefinition(
        config,
        resolver,
        undefined,
        destinationSchemas,
    );
}

describe('export wizard destination conversion', () => {
    it('preserves the canonical extractor entity value', () => {
        const definition = convert(configuration({ type: 'LOCAL' }));
        const extract = definition.steps.find(step => step.type === 'EXTRACT');

        expect(extract?.config).toMatchObject({
            adapterCode: 'vendureQuery',
            entity: 'PRODUCT',
        });
    });

    it('emits canonical local delivery config and schema defaults', () => {
        expect(exportConfig({ type: 'LOCAL' })).toMatchObject({
            adapterCode: 'csvExport',
            destinationType: 'LOCAL',
            directory: '.',
        });
    });

    it('emits canonical HTTP url and nested auth config', () => {
        const config = exportConfig({
            type: 'HTTP',
            httpConfig: {
                url: 'https://partner.example.com/import',
                headers: { 'X-Tenant': 'catalog' },
                headerSecretCodes: { Authorization: 'partner-token' },
                auth: { type: 'NONE' },
            },
        });

        expect(config).toMatchObject({
            destinationType: 'HTTP',
            url: 'https://partner.example.com/import',
            method: 'POST',
            auth: { type: 'NONE' },
            headerSecretCodes: { Authorization: 'partner-token' },
        });
        expect(config).not.toHaveProperty('endpoint');
    });

    it('rejects destinations without an implemented runtime', () => {
        const unsupported = {
            type: 'DOWNLOAD',
        } as unknown as DestinationConfig;
        expect(() => exportConfig(unsupported)).toThrow(
            'Unsupported export destination: DOWNLOAD',
        );
    });

    it('rejects formats without a backend adapter mapping', () => {
        const config = configuration({ type: 'LOCAL' });
        config.format.type = 'PARQUET';
        expect(() =>
            exportConfigToPipelineDefinition(
                config,
                resolver,
                undefined,
                destinationSchemas,
            ),
        ).toThrow('No exporter adapter is registered for format "PARQUET"');
    });
    it('serializes supported query filters and ordering into the extract step', () => {
        const config = configuration({ type: 'LOCAL' });
        config.sourceQuery = {
            type: 'query',
            orderBy: 'updatedAt',
            orderDirection: 'DESC',
        };
        config.filters = [
            { field: 'enabled', operator: 'eq', value: true },
            { field: 'name', operator: 'contains', value: 'summer' },
        ];

        const extract = convert(config).steps.find(
            (step) => step.type === 'EXTRACT',
        );

        expect(extract?.config).toMatchObject({
            adapterCode: 'vendureQuery',
            sortBy: 'updatedAt',
            sortOrder: 'DESC',
            filters: [
                { field: 'enabled', operator: 'eq', value: true },
                { field: 'name', operator: 'contains', value: 'summer' },
            ],
        });
    });

    it('serializes supported field transformations after projection and rename', () => {
        const config = configuration({ type: 'LOCAL' });
        config.fields = [
            {
                sourceField: 'name',
                outputName: 'title',
                include: true,
                transformation: 'trim',
            },
            {
                sourceField: 'description',
                outputName: 'body',
                include: true,
                transformation: 'stripHtml',
            },
        ];

        const transform = convert(config).steps.find(
            (step) => step.type === 'TRANSFORM',
        );

        expect(transform?.config.operators).toEqual(
            expect.arrayContaining([
                { op: 'trim', args: { path: 'title' } },
                { op: 'stripHtml', args: { source: 'body', target: 'body' } },
            ]),
        );
    });

    it('rejects export controls that cannot be represented by the runtime contract', () => {
        const filterConfig = configuration({ type: 'LOCAL' });
        filterConfig.sourceQuery = { type: 'query' };
        filterConfig.filters = [
            { field: 'name', operator: 'regex', value: '^A' },
        ];
        expect(() => convert(filterConfig)).toThrow(
            'filter operator "regex" is not supported',
        );

        const transformConfig = configuration({ type: 'LOCAL' });
        transformConfig.fields[0].transformation = 'dateFormat';
        expect(() => convert(transformConfig)).toThrow(
            'field transformation "dateFormat" requires configuration',
        );
    });
});
