import { JsonObject, ExtractorAdapter, ExtractContext, RecordEnvelope, StepConfigSchema } from '../../../../src';

export const generatorExtractorSchema: StepConfigSchema = {
    fields: [
        { key: 'count', type: 'number', label: 'Record Count', required: true, defaultValue: 100 },
        { key: 'template', type: 'json', label: 'Record Template', required: true, placeholder: '{"name": "Product {{index}}"}' },
        { key: 'batchSize', type: 'number', label: 'Batch Size', required: false, defaultValue: 100 },
        { key: 'delayMs', type: 'number', label: 'Delay Between Batches (ms)', required: false, defaultValue: 0 },
    ],
};

interface GeneratorExtractorConfig {
    count: number;
    template: JsonObject;
    batchSize?: number;
    delayMs?: number;
}

function processTemplate(template: unknown, index: number): unknown {
    if (typeof template === 'string') {
        return template
            .replace(/\{\{index\}\}/g, String(index))
            .replace(/\{\{random\s+(\d+)\s+(\d+)\}\}/g, (_, min, max) => {
                return String(Math.floor(Math.random() * (parseInt(max) - parseInt(min) + 1)) + parseInt(min));
            })
            .replace(/\{\{uuid\}\}/g, () => crypto.randomUUID?.() ?? `uuid-${index}-${Date.now()}`)
            .replace(/\{\{timestamp\}\}/g, () => new Date().toISOString());
    }
    if (Array.isArray(template)) return template.map(item => processTemplate(item, index));
    if (template && typeof template === 'object') {
        const result: JsonObject = {};
        for (const [key, value] of Object.entries(template)) result[key] = processTemplate(value, index) as JsonObject[string];
        return result;
    }
    return template;
}

export const generatorExtractor: ExtractorAdapter<GeneratorExtractorConfig> = {
    type: 'EXTRACTOR',
    code: 'generator',
    name: 'Data Generator',
    description: 'Generate test/sample records using templates (streaming)',
    category: 'DATA_SOURCE',
    schema: generatorExtractorSchema,
    icon: 'sparkles',
    version: '1.0.0',
    batchable: true,

    async *extract(context: ExtractContext, config: GeneratorExtractorConfig): AsyncGenerator<RecordEnvelope, void, undefined> {
        const { count, template, batchSize = 100, delayMs = 0 } = config;
        context.logger.info(`Generating ${count} records`);

        for (let i = 0; i < count; i++) {
            yield {
                data: processTemplate(template, i + 1) as JsonObject,
                meta: { sourceId: String(i + 1), sequence: i, hash: `gen-${i + 1}` },
            };

            if (delayMs > 0 && (i + 1) % batchSize === 0 && i < count - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        context.logger.info(`Completed generating ${count} records`);
    },
};

export default generatorExtractor;
