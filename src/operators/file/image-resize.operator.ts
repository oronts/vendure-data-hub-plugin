import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { processImageRecords } from './shared';

export const IMAGE_RESIZE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'imageResize',
    name: 'Image Resize',
    description: 'Resize images referenced in record fields (base64-encoded)',
    category: 'CONVERSION',
    categoryLabel: 'File',
    categoryOrder: 9,
    version: '1.0.0',
    wizardHidden: true,
    schema: {
        groups: [{ id: 'main', label: 'Resize Settings' }],
        fields: [
            { key: 'sourceField', label: 'Source Field', type: 'string', required: true, group: 'main' },
            { key: 'targetField', label: 'Target Field', type: 'string', group: 'main', description: 'Defaults to source field if not set' },
            { key: 'width', label: 'Width', type: 'number', group: 'main' },
            { key: 'height', label: 'Height', type: 'number', group: 'main' },
            {
                key: 'fit', label: 'Fit', type: 'select', group: 'main', options: [
                    { value: 'cover', label: 'Cover' },
                    { value: 'contain', label: 'Contain' },
                    { value: 'fill', label: 'Fill' },
                    { value: 'inside', label: 'Inside' },
                    { value: 'outside', label: 'Outside' },
                ],
            },
            {
                key: 'format', label: 'Output Format', type: 'select', group: 'main', options: [
                    { value: 'jpeg', label: 'JPEG' },
                    { value: 'png', label: 'PNG' },
                    { value: 'webp', label: 'WebP' },
                    { value: 'avif', label: 'AVIF' },
                ],
            },
            { key: 'quality', label: 'Quality (1-100)', type: 'number', group: 'main' },
        ],
    },
};

interface ImageResizeConfig {
    sourceField: string;
    targetField?: string;
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    format?: 'jpeg' | 'png' | 'webp' | 'avif';
    quality?: number;
}

export async function imageResizeOperator(
    records: readonly JsonObject[],
    config: ImageResizeConfig,
    _helpers: AdapterOperatorHelpers,
): Promise<OperatorResult> {
    const output = await processImageRecords(records, config, async (sharp, inputBuffer, cfg) => {
        let pipeline = sharp(inputBuffer);

        if (cfg.width || cfg.height) {
            pipeline = pipeline.resize({
                width: cfg.width,
                height: cfg.height,
                fit: cfg.fit ?? 'cover',
            });
        }

        if (cfg.format) {
            pipeline = pipeline.toFormat(cfg.format, { quality: cfg.quality });
        }
        // If no format specified, output in original format (quality only applies with explicit format)

        return await pipeline.toBuffer();
    });

    return { records: output };
}
