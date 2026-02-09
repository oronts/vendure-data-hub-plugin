import { JsonObject, BatchExtractorAdapter, ExtractContext, ExtractResult, StepConfigSchema } from '../../../../src';

export const inMemoryExtractorSchema: StepConfigSchema = {
    fields: [
        { key: 'data', type: 'json', label: 'Data Array', required: true, placeholder: '[{"id": "1", "name": "Product"}]' },
        { key: 'delay', type: 'number', label: 'Simulated Delay (ms)', required: false, defaultValue: 0 },
        { key: 'failOnEmpty', type: 'boolean', label: 'Fail on Empty', required: false, defaultValue: false },
    ],
};

interface InMemoryExtractorConfig {
    data: JsonObject[];
    delay?: number;
    failOnEmpty?: boolean;
}

export const inMemoryExtractor: BatchExtractorAdapter<InMemoryExtractorConfig> = {
    type: 'EXTRACTOR',
    code: 'inMemory',
    name: 'In-Memory Data',
    description: 'Extract records from an in-memory data array',
    category: 'DATA_SOURCE',
    schema: inMemoryExtractorSchema,
    icon: 'memory',
    version: '1.0.0',

    async extractAll(context: ExtractContext, config: InMemoryExtractorConfig): Promise<ExtractResult> {
        const { data, delay = 0, failOnEmpty = false } = config;

        if (!Array.isArray(data)) {
            throw new Error('Config "data" must be an array');
        }

        if (data.length === 0 && failOnEmpty) {
            throw new Error('Data array is empty');
        }

        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));

        context.logger.info(`Extracted ${data.length} records from in-memory source`);

        return {
            records: data.map((item, index) => ({
                data: item,
                meta: { sourceId: String((item as JsonObject).id ?? index), sequence: index },
            })),
            metrics: { totalFetched: data.length },
        };
    },
};

export default inMemoryExtractor;
