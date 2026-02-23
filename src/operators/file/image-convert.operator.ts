import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { processImageRecords } from './shared';

export const IMAGE_CONVERT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'imageConvert',
    name: 'Image Convert',
    description: 'Convert image format (JPEG, PNG, WebP, AVIF, GIF)',
    category: 'CONVERSION',
    categoryLabel: 'File',
    categoryOrder: 9,
    version: '1.0.0',
    wizardHidden: true,
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
    const output = await processImageRecords(records, config, async (sharp, inputBuffer, cfg) => {
        return await sharp(inputBuffer)
            .toFormat(cfg.format, { quality: cfg.quality })
            .toBuffer();
    });

    return { records: output };
}
