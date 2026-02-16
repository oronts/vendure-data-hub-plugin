import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { loadSharp } from './shared';

export const IMAGE_CONVERT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'imageConvert',
    name: 'Image Convert',
    description: 'Convert image format (JPEG, PNG, WebP, AVIF, GIF)',
    category: 'CONVERSION',
    version: '1.0.0',
    schema: {
        groups: [{ id: 'main', label: 'Convert Settings' }],
        fields: [
            { key: 'sourceField', label: 'Source Field', type: 'string', required: true, group: 'main' },
            { key: 'targetField', label: 'Target Field', type: 'string', group: 'main', description: 'Defaults to source field if not set' },
            {
                key: 'format', label: 'Output Format', type: 'select', required: true, group: 'main', options: [
                    { value: 'jpeg', label: 'JPEG' },
                    { value: 'png', label: 'PNG' },
                    { value: 'webp', label: 'WebP' },
                    { value: 'avif', label: 'AVIF' },
                    { value: 'gif', label: 'GIF' },
                ],
            },
            { key: 'quality', label: 'Quality (1-100)', type: 'number', group: 'main' },
        ],
    },
};

interface ImageConvertConfig {
    sourceField: string;
    targetField?: string;
    format: 'jpeg' | 'png' | 'webp' | 'avif' | 'gif';
    quality?: number;
}

export async function imageConvertOperator(
    records: readonly JsonObject[],
    config: ImageConvertConfig,
    _helpers: AdapterOperatorHelpers,
): Promise<OperatorResult> {
    const sharp = await loadSharp();
    const output: JsonObject[] = [];

    for (const record of records) {
        const sourceValue = record[config.sourceField];
        if (!sourceValue || typeof sourceValue !== 'string') {
            output.push({ ...record });
            continue;
        }

        try {
            const inputBuffer = Buffer.from(sourceValue, 'base64');
            if (inputBuffer.length === 0) {
                output.push({ ...record });
                continue;
            }
            const outputBuffer = await sharp(inputBuffer)
                .toFormat(config.format, { quality: config.quality })
                .toBuffer();
            const targetField = config.targetField ?? config.sourceField;
            output.push({ ...record, [targetField]: outputBuffer.toString('base64') });
        } catch (e: unknown) {
            // Log warning - keep original record on processing failure
            output.push({ ...record });
        }
    }

    return { records: output };
}
