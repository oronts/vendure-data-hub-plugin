import { describe, expect, it } from 'vitest';
import type { OperatorConfig, PipelineDefinition } from '../../shared/types';
import type { ImportConfiguration } from '../components/wizards/import-wizard/types';
import type { TypedOptionValue } from '../hooks/api/use-config-options';
import type { WizardStrategyMapping } from '../types/wizard';
import { importConfigToPipelineDefinition } from './wizard-to-pipeline';

const strategyMappings = [{
    wizardValue: 'SKIP',
    label: 'Skip',
    loadStrategy: 'CREATE',
    conflictStrategy: 'SOURCE_WINS',
}] satisfies WizardStrategyMapping[];

function createConfiguration(): ImportConfiguration {
    return {
        name: 'Defaults import',
        source: {
            type: 'FILE',
            fileConfig: { format: 'CSV', fileId: 'file-import-1', hasHeaders: true },
        },
        targetEntity: 'product',
        mappings: [
            { sourceField: 'sourceSku', targetField: 'sku', required: true, defaultValue: 'unknown' },
            { sourceField: 'stock', targetField: 'stock', required: false, defaultValue: 0 },
            { sourceField: 'active', targetField: 'active', required: false, defaultValue: false },
            { sourceField: 'empty', targetField: 'empty', required: false, defaultValue: '' },
            { sourceField: 'blank', targetField: 'blank', required: false, defaultValue: '   ' },
            { sourceField: 'missing', targetField: 'missing', required: false },
            { sourceField: 'nullable', targetField: 'nullable', required: false, defaultValue: null },
            { sourceField: 'untargeted', targetField: '', required: false, defaultValue: 'ignored' },
        ],
        strategies: {
            existingRecords: 'SKIP',
            lookupFields: ['sku'],
            batchSize: 100,
            parallelBatches: 1,
            continueOnError: false,
        },
        trigger: { type: 'MANUAL' },
        transformations: [{ id: 'trim', type: 'MAP', config: { fields: ['name'] } }],
    };
}

function getDefinition(config: ImportConfiguration): PipelineDefinition {
    return importConfigToPipelineDefinition(config, strategyMappings);
}

function getTransformOperators(config: ImportConfiguration): OperatorConfig[] {
    const transform = getDefinition(config).steps.find(step => step.key === 'transform');
    return (transform?.config.operators ?? []) as unknown as OperatorConfig[];
}

describe('importConfigToPipelineDefinition', () => {
    it('emits one atomic mapping before defaults and user transformations', () => {
        expect(getTransformOperators(createConfiguration())).toEqual([
            {
                op: 'map',
                args: { mapping: { sku: 'sourceSku' }, passthrough: true },
            },
            { op: 'remove', args: { path: 'sourceSku' } },
            { op: 'enrich', args: { defaults: { sku: 'unknown', stock: 0, active: false } } },
            { op: 'MAP', args: { fields: ['name'] } },
        ]);
    });

    it('omits enrich when no mapping has a usable default', () => {
        const config = createConfiguration();
        config.mappings = config.mappings.filter(mapping =>
            ['empty', 'blank', 'missing', 'nullable', ''].includes(mapping.targetField),
        );

        expect(getTransformOperators(config)).toEqual([
            { op: 'MAP', args: { fields: ['name'] } },
        ]);
    });

    it('preserves swap mappings without sequential rename corruption', () => {
        const config = createConfiguration();
        config.mappings = [
            { sourceField: 'a', targetField: 'b', required: false },
            { sourceField: 'b', targetField: 'a', required: false },
        ];
        config.transformations = [];

        expect(getTransformOperators(config)).toEqual([
            {
                op: 'map',
                args: { mapping: { b: 'a', a: 'b' }, passthrough: true },
            },
        ]);
    });

    it('rejects mappings that target the same field', () => {
        const config = createConfiguration();
        config.mappings = [
            { sourceField: 'a', targetField: 'target', required: false },
            { sourceField: 'b', targetField: 'target', required: false },
        ];

        expect(() => getDefinition(config)).toThrow(
            'Multiple source fields cannot map to target field "target"',
        );
    });

    it('places execution controls where the runtime reads them', () => {
        const definition = getDefinition(createConfiguration());
        const load = definition.steps.find(step => step.key === 'load');

        expect(load).toMatchObject({
            continueOnError: false,
            throughput: {
                batchSize: 100,
                concurrency: 1,
            },
            config: {
                skipDuplicates: true,
            },
        });
        expect(load?.config).not.toHaveProperty('batchSize');
        expect(load?.config).not.toHaveProperty('parallelBatches');
        expect(load?.config).not.toHaveProperty('continueOnError');
        expect(load?.config).not.toHaveProperty('errorThreshold');
        expect(definition.context).toBeUndefined();
    });

    it('forwards persistent file IDs and format-specific options to extractors', () => {
        const csv = createConfiguration();
        const csvExtract = getDefinition(csv).steps.find(step => step.key === 'extract');
        expect(csvExtract?.config).toMatchObject({
            adapterCode: 'csv',
            fileId: 'file-import-1',
            hasHeader: true,
        });

        const xlsx = createConfiguration();
        xlsx.source.fileConfig = {
            format: 'XLSX',
            fileId: 'file-workbook-1',
            hasHeaders: false,
            sheetName: 'Products',
        };
        const xlsxExtract = getDefinition(xlsx).steps.find(step => step.key === 'extract');
        expect(xlsxExtract?.config).toMatchObject({
            adapterCode: 'xlsx',
            fileId: 'file-workbook-1',
            hasHeader: false,
            sheetName: 'Products',
        });

        const xml = createConfiguration();
        xml.source.fileConfig = {
            format: 'XML',
            fileId: 'file-xml-1',
            hasHeaders: true,
            recordPath: 'catalog.product',
            attributePrefix: '@',
        };
        const xmlExtract = getDefinition(xml).steps.find(step => step.key === 'extract');
        expect(xmlExtract?.config).toMatchObject({
            adapterCode: 'xml',
            fileId: 'file-xml-1',
            recordPath: 'catalog.product',
            attributePrefix: '@',
        });
    });

    it('preserves case-sensitive custom extractor codes', () => {
        const config = createConfiguration();
        config.source = {
            type: 'myExtractor',
            myextractorConfig: { endpoint: 'https://source.example/data' },
        };

        const extract = getDefinition(config).steps.find(step => step.key === 'extract');
        expect(extract?.config).toEqual({
            adapterCode: 'myExtractor',
            endpoint: 'https://source.example/data',
        });
    });

    it.each([
        ['schema-driven', [{
            value: 'FILE',
            label: 'File Watch',
            fields: [
                { key: 'connectionCode', label: 'Connection Code', type: 'string', required: true },
                { key: 'path', label: 'Watch Path', type: 'string', required: true },
                { key: 'pattern', label: 'File Pattern', type: 'string' },
                { key: 'recursive', label: 'Recursive', type: 'boolean' },
                { key: 'minFileAge', label: 'Minimum File Age', type: 'number' },
                { key: 'pollIntervalMs', label: 'Poll Interval', type: 'number' },
            ],
            configKeyMap: {
                connectionCode: 'fileWatch.connectionCode',
                path: 'fileWatch.path',
                pattern: 'fileWatch.pattern',
                recursive: 'fileWatch.recursive',
                minFileAge: 'fileWatch.minFileAge',
                pollIntervalMs: 'fileWatch.pollIntervalMs',
            },
        } satisfies TypedOptionValue]],
        ['fallback', undefined],
    ])('emits canonical nested FILE trigger config through the %s path', (_path, schemas) => {
        const config = createConfiguration();
        config.trigger = {
            type: 'FILE',
            connectionCode: 'incoming-files',
            path: '/incoming/*.csv',
            pattern: '*.csv',
            recursive: false,
            minFileAge: 0,
            pollIntervalMs: 60_000,
        };

        const definition = importConfigToPipelineDefinition(
            config,
            strategyMappings,
            undefined,
            undefined,
            schemas,
        );
        expect(definition.steps[0].config).toEqual({
            type: 'FILE',
            fileWatch: {
                connectionCode: 'incoming-files',
                path: '/incoming/*.csv',
                pattern: '*.csv',
                recursive: false,
                minFileAge: 0,
                pollIntervalMs: 60_000,
            },
        });
        expect(Object.prototype.hasOwnProperty.call(definition.steps[0].config, 'fileWatch.connectionCode')).toBe(false);
        expect(definition.steps[0].config).not.toHaveProperty('fileWatchPath');
    });
});
